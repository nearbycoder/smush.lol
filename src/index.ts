import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);

app.listen(port);

console.log(`smush.lol is ready at http://${app.server?.hostname}:${app.server?.port}`);
