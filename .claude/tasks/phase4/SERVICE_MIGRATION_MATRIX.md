# Service Migration Matrix - No Overlaps Verification

## Original Services → Migration Domains

| Original Service | Source File | Migration Domain | Target Location |
|------------------|-------------|------------------|------------------|
| **SpotQuoteService** | `/services/spot-quote.ts` | **onetoken/quotes** | `onetoken/services/spot-quote.service.ts` |
| **OneTokenDataInitRunner** | `/services/cronjob/runners/1token.ts` | **onetoken/portfolios** | `onetoken/services/portfolio-data-init.service.ts` |
| **PortfolioValuationRunner** | `/services/cronjob/runners/portfolio-valuation.ts` | **onetoken/portfolios** | `onetoken/services/portfolio-valuation.service.ts` |
| **HRPAccountProcessorService** | `/services/hrp/hrp-account-processor.ts` | **accounts** | `accounts/services/hrp-account-processor.service.ts` |
| **HRPTransferService** | `/services/hrp/hrp-transfer-service.ts` | **transfers** | `transfers/services/hrp-transfer.service.ts` |
| **TransferConversionService** | `/services/transfer-conversion-service.ts` | **transfers** | `transfers/services/transfer-conversion.service.ts` |
| **CurrencyConversionService** | `/services/currency-conversion-service.ts` | **currency** | `currency/services/currency-conversion.service.ts` |
| **HRPFeeIngestionService** | `/services/hrp/hrp-fee-ingestion.ts` | **fees** | `fees/services/hrp-fee-ingestion.service.ts` |
| **CIPFeeService** | `/services/cip-fee-service.ts` | **fees** | `fees/services/cip-fee.service.ts` |
| **PortfolioFeeService** | `/services/portfolio-fee-service.ts` | **fees** | `fees/services/portfolio-fee.service.ts` |
| **PortfolioCalcService** | `/services/portfolio-calc.ts` | **portfolio** | `portfolio/services/portfolio-calc.service.ts` |
| **CronjobService** | `/services/cronjob/index.ts` | **system** | `system/services/scheduler.service.ts` |
| **DashboardAPIService** | `/services/api/dashboard-api-service.ts` | **system** | `system/controllers/*.controller.ts` |
| **HRPFeeSchedulerService** | `/services/hrp/hrp-fee-scheduler.ts` | **system** | `system/services/hrp-fee-scheduler.service.ts` |

## Services NOT Being Migrated (Cronjob Runners)

| Service | Source File | Reason |
|---------|-------------|---------|
| **TradingAccountFeeService** | `/services/trading-account-fee-service.ts` | Cronjob runner, handled by system schedulers |
| **TradingAccountTransferService** | `/services/trading-account-transfer-service.ts` | Cronjob runner, handled by system schedulers |

## Verification: No Overlaps ✅

Each service appears in exactly **ONE** migration domain:
- ✅ No service is migrated twice
- ✅ All core services are covered
- ✅ Only actual services from codebase are included
- ✅ No over-engineered services created

## Domain Dependencies (Clean)

```
1Token Quotes (Foundation)
├── 1Token Portfolios (uses quotes)
├── Currency (uses quotes)
└── Fees (may use currency conversion)

Accounts (Foundation)
├── Transfers (uses account classification)
└── Fees (uses account data)

Portfolio (Top Level)
├── Uses: Fees
├── Uses: Transfers
├── Uses: Currency
└── Uses: 1Token Portfolio data

System (Top Level)
├── Orchestrates all domains
└── Provides API endpoints
```

This matrix ensures **zero overlap** and **complete coverage** of actual services.