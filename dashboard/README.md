# Daylight dashboard

See the [project README](../README.md) for the goal, setup instructions, supported formats, privacy notes, and troubleshooting.

If your terminal is already in this folder:

```sh
node import.mjs "/path/to/extracted/Takeout"
node server.mjs
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). To run validation after importing:

```sh
node --test test.mjs features.test.mjs real-export.test.mjs
```
