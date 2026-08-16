import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-autocount-cloud'
export const inject = ['tools']

type JsonObject = Record<string, unknown>
function textOutput() {
  return {
    schema: { type: 'string' as const },
    render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }]
  }
}

interface Config {
  baseUrl?: string
  apiKey?: string
  connectorId?: string
  companyId?: string
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function makeCommandId(type: string): string {
  const safeType = type.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '')
  return `dsh-${safeType}-${Date.now()}`
}

export function apply(ctx: Context, config: Config = {}) {
  const baseUrl = (config.baseUrl || env('AUTOCOUNT_CLOUD_URL') || 'https://api.autocount.cloud').replace(/\/+$/, '')
  const defaultConnectorId = config.connectorId || env('AUTOCOUNT_CONNECTOR_ID')
  const defaultCompanyId = config.companyId || env('AUTOCOUNT_COMPANY_ID')
  const pollIntervalMs = config.pollIntervalMs ?? 1000
  const pollTimeoutMs = config.pollTimeoutMs ?? 60000

  function authHeaders(): Record<string, string> {
    const apiKey = config.apiKey || env('AUTOCOUNT_API_KEY') || env('AUTOCOUNT_TENANT_API_KEY')
    if (!apiKey) {
      throw new Error('Set AUTOCOUNT_API_KEY or AUTOCOUNT_TENANT_API_KEY before using AutoCount Cloud tools.')
    }
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  }

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    if (!response.ok) {
      throw new Error(`AutoCount Cloud ${method} ${path} failed: ${response.status} ${jsonText(data)}`)
    }
    return data
  }

  async function submitCommand(args: JsonObject): Promise<unknown> {
    const type = String(args.type || '')
    if (!type) throw new Error('type is required.')
    const connectorId = String(args.connectorId || defaultConnectorId || '')
    const companyId = String(args.companyId || defaultCompanyId || '')
    if (!connectorId) throw new Error('connectorId is required or set AUTOCOUNT_CONNECTOR_ID.')
    if (!companyId) throw new Error('companyId is required or set AUTOCOUNT_COMPANY_ID.')

    return request('POST', '/v1/commands', {
      commandId: String(args.commandId || makeCommandId(type)),
      connectorId,
      companyId,
      type,
      payload: (args.payload || {}) as JsonObject
    })
  }

  ;(ctx as any).tools.register(defineTool({
    name: 'autocount_command_schema',
    description: 'Read the AutoCount Cloud schema for one command type.',
    parameters: {
      commandType: { type: 'string', required: true, description: 'Example: create-cash-sale or get-sales-invoice.' }
    },
    output: textOutput(),
    async execute(args) {
      const commandType = String(args.commandType || '')
      if (!commandType) throw new Error('commandType is required.')
      return jsonText(await request('GET', `/v1/schema/commands/${encodeURIComponent(commandType)}`))
    }
  }))

  ;(ctx as any).tools.register(defineTool({
    name: 'autocount_submit_command',
    description: 'Submit an AutoCount Cloud connector command and return the queued command response.',
    parameters: {
      type: { type: 'string', required: true, description: 'AutoCount command type.' },
      payload: { type: 'object', description: 'Command payload.', additionalProperties: true },
      commandId: { type: 'string', description: 'Optional idempotent command ID.' },
      connectorId: { type: 'string', description: 'Optional connector ID override.' },
      companyId: { type: 'string', description: 'Optional company ID override.' }
    },
    output: textOutput(),
    async execute(args) {
      return jsonText(await submitCommand(args))
    }
  }))

  ;(ctx as any).tools.register(defineTool({
    name: 'autocount_get_command',
    description: 'Get one AutoCount Cloud command by commandId.',
    parameters: {
      commandId: { type: 'string', required: true, description: 'Command ID to read.' }
    },
    output: textOutput(),
    async execute(args) {
      const commandId = String(args.commandId || '')
      if (!commandId) throw new Error('commandId is required.')
      return jsonText(await request('GET', `/v1/commands/${encodeURIComponent(commandId)}`))
    }
  }))

  ;(ctx as any).tools.register(defineTool({
    name: 'autocount_run_command',
    description: 'Submit an AutoCount command, then poll until done, failed, or timeout.',
    parameters: {
      type: { type: 'string', required: true, description: 'AutoCount command type.' },
      payload: { type: 'object', description: 'Command payload.', additionalProperties: true },
      commandId: { type: 'string', description: 'Optional idempotent command ID.' },
      connectorId: { type: 'string', description: 'Optional connector ID override.' },
      companyId: { type: 'string', description: 'Optional company ID override.' },
      timeoutMs: { type: 'number', description: 'Optional polling timeout in milliseconds.' }
    },
    output: textOutput(),
    async execute(args) {
      const started = await submitCommand(args) as JsonObject
      const command = (started.command || started) as JsonObject
      const commandId = String(command.commandId || args.commandId || '')
      if (!commandId) return jsonText(started)

      const timeoutAt = Date.now() + Number(args.timeoutMs || pollTimeoutMs)
      let current: unknown = started
      while (Date.now() < timeoutAt) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
        current = await request('GET', `/v1/commands/${encodeURIComponent(commandId)}`)
        const status = String(((current as JsonObject).command as JsonObject | undefined)?.status || '')
        if (status === 'done' || status === 'failed') return jsonText(current)
      }
      return jsonText({ ok: false, timedOut: true, commandId, last: current })
    }
  }))
}
