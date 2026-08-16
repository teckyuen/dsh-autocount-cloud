# dsh-autocount-cloud

DeepSeek Harness plugin for calling AutoCount Cloud connector commands.

It gives DSH four tools:

- `autocount_command_schema` - read one command schema from AutoCount Cloud
- `autocount_submit_command` - submit a command to the connector queue
- `autocount_get_command` - read command status/result by command ID
- `autocount_run_command` - submit and poll until done, failed, or timeout

## Install

```sh
dsh plugin --profile web add github:YOUR_GITHUB_OWNER/dsh-autocount-cloud
```

For local development:

```sh
dsh plugin --profile web add link:/path/to/dsh-autocount-cloud
```

## Configuration

Set environment variables before starting DeepSeek Harness:

```sh
AUTOCOUNT_CLOUD_URL=https://api.autocount.cloud
AUTOCOUNT_API_KEY=ak_xxx
AUTOCOUNT_CONNECTOR_ID=your-connector-id
AUTOCOUNT_COMPANY_ID=your-company-id
```

Do not commit API keys to GitHub.

## Example Use

Ask DeepSeek:

```text
Use autocount_run_command to read 10 debtors.
```

Tool arguments:

```json
{
  "type": "read-debtors",
  "payload": {
    "limit": 10
  }
}
```

To inspect a payload before writing:

```json
{
  "commandType": "create-cash-sale"
}
```

## Safety

This plugin only calls AutoCount Cloud API endpoints. It does not contain AutoCount credentials, customer data, or direct SQL access.

For write commands, the AutoCount connector and AutoCount SDK still decide what can be saved.

## License

MIT

## Maintainer

Mac Soft Sdn Bhd - ricky@macsoft.my
