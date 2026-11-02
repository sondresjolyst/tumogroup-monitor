import { main } from './refresh';

main(process.env)
    .then((code) => {
        process.exitCode = code;
    })
    .catch(() => {
        console.error('Job failed unexpectedly.');
        process.exitCode = 1;
    });
