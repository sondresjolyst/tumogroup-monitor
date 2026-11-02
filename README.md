# tumogroup-monitor

A private web page that shows the state of Renovate across all repositories, including open pull requests, cooldowns and the next planned run. It is a Next.js app that ships as a Docker image.

## Environment variables

The page needs these:

- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: the OAuth app used for sign-in.
- `NEXTAUTH_SECRET`: the key that signs the session cookie.
- `NEXTAUTH_URL`: the public address of the page. In production it must start with `https://`, or every page except `/health` stays closed.
- `ALLOWED_GITHUB_USER_ID`: the numeric GitHub user ID of the one account that may sign in. If it is missing or not only digits, nobody gets in.
- `DATABASE_URL`: the connection string for the `tumogroup_monitor_readonly` role.

The refresh job needs these:

- `DATABASE_URL`: the connection string for the role that writes the state.
- `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY`: the GitHub App that reads the repositories.
- `GITHUB_API_URL`: optional, defaults to the public GitHub API.
- `GITHUB_TIMEOUT_MS`: optional, the timeout for each GitHub request.
