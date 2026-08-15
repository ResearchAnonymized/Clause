# Test fixtures

Drop the 2M-IT sample contract pair here before running tests:

- `2m-it-customer.pdf` — the customer template (from the 2M-IT technical briefing)
- `2m-it-supplier.pdf` — the supplier draft contract

Then point the tests at them:

```
export SAMPLE_CUSTOMER_PATH=./worker/tests/fixtures/2m-it-customer.pdf
export SAMPLE_SUPPLIER_PATH=./worker/tests/fixtures/2m-it-supplier.pdf
```

Any PDF/DOCX/TXT pair works — the file names are not special.
