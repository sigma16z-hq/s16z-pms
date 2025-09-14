import { spawn } from 'child_process';
import { createLogger } from '../../common/src/logger';
import { GlobalConfig } from '../../common/src/config';
import { ServiceManager } from '../../common/services/service-manager';
import { randomBytes } from 'crypto';
import waitOn from 'wait-on';

const logger = createLogger('PostgresFixture');

export interface PostgresFixtureControl {
  start: () => Promise<string>;
  teardown: () => Promise<void>;
  reset: () => Promise<void>;
  getConnectionString: () => string;
}

export interface AppFixtureControl {
  start: () => Promise<void>;
  teardown: () => Promise<void>;
  getServiceManager: () => ServiceManager;
}

export interface DockerPostgresOptions {
  port?: number;
  image?: string;
  password?: string;
  database?: string;
  user?: string;
}

/**
 * Creates a temporary PostgreSQL instance using Docker
 */
export function testPostgresFixture(options: DockerPostgresOptions = {}): PostgresFixtureControl {
  const {
    port = 5432,
    image = 'postgres:16-alpine',
    password = 'test_password',
    database = 'test_db',
    user = 'test_user',
  } = options;

  const containerName = `test-postgres-${randomBytes(8).toString('hex')}`;
  let connectionString = '';

  const start = async (): Promise<string> => {
    logger.info(`Starting PostgreSQL container: ${containerName}`);

    // Check if Docker is available
    try {
      await executeCommand('docker', ['--version']);
    } catch (error) {
      throw new Error('Docker is not available. Please install Docker to run tests.');
    }

    // Run PostgreSQL container
    const dockerArgs = [
      'run',
      '--rm',
      '--name',
      containerName,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      `POSTGRES_USER=${user}`,
      '-e',
      `POSTGRES_DB=${database}`,
      '-p',
      `${port}:5432`,
      '-d',
      image,
    ];

    try {
      const containerId = await executeCommand('docker', dockerArgs);
      logger.debug(`Container started with ID: ${containerId}`);

      // Wait for PostgreSQL to be ready
      connectionString = `postgresql://${user}:${password}@localhost:${port}/${database}`;

      await waitOn({
        resources: [`tcp:localhost:${port}`],
        delay: 1000,
        timeout: 30000,
      });

      // Additional wait for PostgreSQL to fully initialize
      await waitForPostgres(connectionString);

      logger.info(`PostgreSQL is ready at: ${connectionString}`);
      return connectionString;
    } catch (error) {
      await teardown();
      throw error;
    }
  };

  const teardown = async (): Promise<void> => {
    logger.info(`Stopping PostgreSQL container: ${containerName}`);

    try {
      await executeCommand('docker', ['stop', containerName]);
      logger.info('PostgreSQL container stopped');
    } catch (error) {
      logger.warn(`Failed to stop container: ${error}`);
      // Try to force remove if stop failed
      try {
        await executeCommand('docker', ['rm', '-f', containerName]);
      } catch (rmError) {
        logger.error(`Failed to remove container: ${rmError}`);
      }
    }
  };

  const reset = async (): Promise<void> => {
    logger.info('Resetting PostgreSQL database');

    // Drop all tables and recreate database
    const resetSql = `
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO ${user};
    `;

    try {
      await executeCommand('docker', ['exec', containerName, 'psql', '-U', user, '-d', database, '-c', resetSql]);
      logger.info('Database reset completed');
    } catch (error) {
      logger.error('Failed to reset database:', error);
      throw error;
    }
  };

  const getConnectionString = (): string => {
    if (!connectionString) {
      throw new Error('PostgreSQL fixture not started');
    }
    return connectionString;
  };

  return {
    start,
    teardown,
    reset,
    getConnectionString,
  };
}

/**
 * Sets up a test application fixture with PostgreSQL
 */
export async function setupTestAppFixture(
  setupServicesCallback: (serviceManager: ServiceManager, globalConfig: GlobalConfig) => void
): Promise<AppFixtureControl> {
  const postgresFixture = testPostgresFixture();
  let serviceManager: ServiceManager;
  let globalConfig: GlobalConfig;

  const start = async (): Promise<void> => {
    // Start PostgreSQL
    const connectionString = await postgresFixture.start();

    // Parse connection string to create config
    const url = new URL(connectionString);
    globalConfig = new GlobalConfig({
      prod: false,
      rootPath: GlobalConfig.createFromEnv().rootPath,
      db: {
        host: url.hostname,
        port: parseInt(url.port),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1), // Remove leading slash
      },
    });

    // Initialize service manager
    serviceManager = new ServiceManager(globalConfig);

    // Setup services
    setupServicesCallback(serviceManager, globalConfig);

    // Start all services
    await serviceManager.startAllServices();
    logger.info('All services started');
  };

  const teardown = async (): Promise<void> => {
    // Stop all services
    if (serviceManager) {
      await serviceManager.stopAllServices();
      logger.info('All services stopped');
    }

    // Stop PostgreSQL
    await postgresFixture.teardown();
  };

  const getServiceManager = (): ServiceManager => {
    if (!serviceManager) {
      throw new Error('Service manager not initialized');
    }
    return serviceManager;
  };

  return {
    start,
    teardown,
    getServiceManager,
  };
}

/**
 * Utility function to execute a command and return its output
 */
async function executeCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', error => {
      reject(error);
    });
  });
}

/**
 * Wait for PostgreSQL to be fully ready by attempting a connection
 */
async function waitForPostgres(connectionString: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to connect using psql
      await executeCommand('docker', [
        'run',
        '--rm',
        '--network',
        'host',
        'postgres:16-alpine',
        'psql',
        connectionString,
        '-c',
        'SELECT 1',
      ]);
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`PostgreSQL failed to start after ${maxRetries} attempts`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Example usage in tests:
 *
 * describe("MyService", () => {
 *   let fixture: AppFixtureControl;
 *
 *   beforeAll(async () => {
 *     fixture = await setupTestAppFixture((serviceManager, config) => {
 *       serviceManager.registerService(MyService);
 *     });
 *     await fixture.start();
 *   });
 *
 *   afterAll(async () => {
 *     await fixture.teardown();
 *   });
 *
 *   it("should do something", async () => {
 *     const serviceManager = fixture.getServiceManager();
 *     const myService = serviceManager.getService(MyService);
 *     // ... test logic
 *   });
 * });
 */
