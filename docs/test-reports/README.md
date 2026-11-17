# ChatSphere: Deliverable 3 test documents

| File | What it is |
|---|---|
| `ChatSphere_Test_Case_Document_v2` (.docx / .pdf) | Test cases TC-001..TC-036 updated for Sprint 1-2 changes, with traceability matrix |
| `ChatSphere_Unit_Test_Report` | Unit test results (node:test) |
| `ChatSphere_System_Validation_Report` | System-level status of every test case, commands, screenshot slots, exit-criteria assessment |
| `ChatSphere_Code_Coverage_Report` | Line and function coverage |
| `ChatSphere_Branch_Coverage_Report` | Branch coverage |
| `ChatSphere_Deliverable3_Complete.pdf` | All five reports in one PDF |
| `evidence/` | Raw logs: unit-test-run.txt, coverage-run.txt, lcov.info, inspection.txt, full-suite-attempt.txt |
| `screenshots/` | Terminal captures of the real runs used in the reports |

Regenerate the evidence (works on Windows, macOS, Linux):

```
cd server
npm ci
npm test
npm run test:coverage
npm run test:report
```
