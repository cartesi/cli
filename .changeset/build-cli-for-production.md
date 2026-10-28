---
"@cartesi/cli": patch
---

print only the message of an error, as intended, instead of a minified class name and a stack trace. The CLI is now built for production unless `NODE_ENV` says otherwise; build with `NODE_ENV=development` to get the full error.
