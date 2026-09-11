# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub private vulnerability reporting](https://github.com/NoxelS/openpatch/security/advisories/new) and include a clear description, affected versions, reproduction steps, impact, and any suggested mitigation. If private reporting is unavailable, contact the repository owner privately through GitHub.

We will acknowledge a report within 7 days, assess it, and coordinate a fix and disclosure with the reporter where possible.

## Security boundaries

OpenPatch runs with the permissions of the local VS Code client. It sends the full active Markdown document and selected text only to the endpoint configured by the user. Its endpoint validation requires HTTPS except for loopback addresses, and optional bearer keys are stored in VS Code SecretStorage.

Treat all model output and content returned by configured endpoints as untrusted. Do not configure endpoints you do not trust with the documents you edit.
