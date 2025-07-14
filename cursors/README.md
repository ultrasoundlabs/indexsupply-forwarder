This directory stores cursor files for your subscriptions.

Each file corresponds to a subscription defined in `config.json` via the `cursorFile` property. The name of the file should match the `cursorFile` value for a subscription.

For example, if you have a subscription with:
`"cursorFile": "cursors/base-usdc-transfers.json"`
The forwarder will create and update `base-usdc-transfers.json` in this directory.

The content of the file is a single number in JSON format, representing the last processed block number. For example:
`19584226`

The forwarder uses this file to resume from where it left off after a restart. If a cursor file does not exist for a subscription, the forwarder will start from block 0.

The `example.json` file is included to show what a cursor file looks like. It is not used by any subscription in the default `config.example.json`. 