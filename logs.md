# Error Logs

| Timestamp | Error Message | Remediation |
| :--- | :--- | :--- |
| 2026-03-06T09:48:50-08:00 | Failed to call the Gemini API, model not found: models/text-embedding-004. | Changed embedding model from `text-embedding-004` to `embedding-001` in `src/lib/gemini.ts`. |
| 2026-03-06T09:51:12-08:00 | Failed to call the Gemini API, model not found: models/embedding-001. | Implemented a fallback mechanism in `src/lib/gemini.ts` to try multiple models (`text-embedding-004`, `embedding-001`, `gemini-3-flash-preview`, etc.) until one succeeds. |
