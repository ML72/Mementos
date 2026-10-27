# Mementos

This repository contains the code for Mementos API endpoints and web app frontend.

## Local Environment Setup

1. Download and install [Node JS](https://nodejs.org/). After installation, you can confirm it's installed correctly by running the commands `node --version` and `npm --version` in a terminal.

2. If you are on Windows, install WSL - here are instructions for [installing WSL and Ubuntu](https://ubuntu.com/tutorials/install-ubuntu-on-wsl2-on-windows-10).

3. If you are on Windows, install [Docker Desktop](https://www.docker.com/products/docker-desktop/). If you are on Mac or Linux, feel free to install Docker Desktop as well for easy management of containers, but you don't have to if you're comfortable with managing containers in the terminal.

4. Download and install a code editor if you don't want to use Notepad. We recommend [VSCode](https://code.visualstudio.com/), but feel free to use other editors as well.

5. Clone the repository.

6. Install dependencies by executing the following command in the project directory (`install:all` installs dependencies for both the server and the client):

    ```
    npm run install:all
    ```

## Local Development

**Starting the app:**

1. If you're on Windows, open Docker Desktop.

2. CD to the project directory.

3. Run the following to start dependent services:

    ```
    npm run docker:up
    ```

4. Run the following to start the development server:

    ```
    npm run dev
    ```

5. The server is now running at `localhost:3000` and the client is now running at `localhost:5173`. Open a browser and go to the client URL to see the app!

    The server log has one status line per service it connects to, starting with `DATABASE:` or `EMAIL:`. If MongoDB isn't running, `DATABASE: could not connect to MongoDB` appears after about 30 seconds and the server stops: start it (step 3), then restart `npm run dev`.

**Stopping the app:**

1. Type `Ctrl+C` in the terminal with the server to stop the server.

2. In Docker Desktop, you can press the Stop button to stop a container and persist its data. Pressing the Delete button will stop a container and delete its data. You can also delete our dependent containers with the following command:

    ```
    npm run docker:down
    ```

**Other helpful tools:**

1. You can use [MongoDB Compass](https://www.mongodb.com/try/download/compass) to view and manipulate db data.

2. You can use [Postman](https://www.postman.com/downloads/) to send requests to the server.

**Email:**

New accounts must enter an emailed code before they can sign in, and "Forgot password?" emails a
reset code. No mail server is needed locally: without SMTP settings every email is printed to the
server console, so read the code from the terminal running `npm run dev`. The seeded users are
already verified. Weekly digests are printed there too, at 12AM UTC on each user's digest day
(see [docs/ENVIRONMENT_OVERVIEW.md](docs/ENVIRONMENT_OVERVIEW.md#weekly-digest) to trigger one).
To see the HTML version of the emails, run `npm run email:preview`. Sending real email over SMTP
locally is covered in [docs/ENVIRONMENT_OVERVIEW.md](docs/ENVIRONMENT_OVERVIEW.md#testing-locally).

## Updating Packages

If the dependencies in `package.json` are outdated, run the following to update them:

```
npm update
```

To fix vulnerabilities that might have appeared since the creation of this template, run the following:

```
npm audit fix --force
```

The same applies for `src/client/package.json`; the above commands can be run in the `src/client` directory.

## Running Integration Tests

Integration tests are written in TypeScript. To run them as TypeScript files, we use [ts-jest](https://kulshekhar.github.io/ts-jest/).

1. Start dependent services:

    ```
    npm run docker:up
    ```

2. Run the tests:

    ```
    npm run test
    ```

3. Close dependent services:

    ```
    npm run docker:down
    ```
