import { describe, expect, test } from 'bun:test'
import {
    CAPABILITIES,
    MCP_TOOLS,
    TOKEN_PLACEHOLDER,
    canOperate,
    capabilitiesByScope,
    clientSnippet,
    daysLeft,
    mcpEndpoint,
    scopeLabel,
    scopesFor,
    sortTokens,
    tokenState,
    tokenViolationField,
    validateTokenName,
} from './agents'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-14T12:00:00Z')
const inDays = (d: number) => new Date(NOW + d * DAY).toISOString()

describe('mcpEndpoint', () => {
    test('appends /mcp to the API base', () => {
        expect(mcpEndpoint('https://api.example.com')).toBe('https://api.example.com/mcp')
    })
    test('tolerates trailing slashes and whitespace in the configured base', () => {
        expect(mcpEndpoint(' https://api.example.com// ')).toBe('https://api.example.com/mcp')
    })
    test('keeps a path prefix', () => {
        expect(mcpEndpoint('https://example.com/api/')).toBe('https://example.com/api/mcp')
    })
})

describe('clientSnippet', () => {
    const url = 'https://api.example.com/mcp'

    test('Claude Code: the documented claude mcp add line, placeholder until a token exists', () => {
        const s = clientSnippet('claude-code', url, '')
        expect(s).toContain(`claude mcp add --transport http fairtier ${url}`)
        expect(s).toContain(`--header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`)
    })

    test('Claude Code: the secret replaces the placeholder', () => {
        const s = clientSnippet('claude-code', url, 'ftw_abc')
        expect(s).toContain('Authorization: Bearer ftw_abc')
        expect(s).not.toContain(TOKEN_PLACEHOLDER)
    })

    test('Cursor: valid mcp.json with url and headers', () => {
        const parsed = JSON.parse(clientSnippet('cursor', url, 'ftw_abc')) as {
            mcpServers: Record<string, { url: string; headers: Record<string, string> }>
        }
        expect(parsed.mcpServers.fairtier).toEqual({ url, headers: { Authorization: 'Bearer ftw_abc' } })
    })

    test('generic: URL and header spelled out', () => {
        const s = clientSnippet('generic', url, '')
        expect(s).toContain(url)
        expect(s).toContain(`Authorization: Bearer ${TOKEN_PLACEHOLDER}`)
    })
})

describe('scopes', () => {
    test('read only asks for read; operate asks for both', () => {
        expect(scopesFor('read')).toEqual(['workspace:read'])
        expect(scopesFor('operate')).toEqual(['workspace:read', 'workspace:write'])
    })
    test('write is what makes a token able to operate', () => {
        expect(canOperate(['workspace:read'])).toBe(false)
        expect(canOperate(['workspace:read', 'workspace:write'])).toBe(true)
        expect(canOperate(['workspace:write'])).toBe(true)
    })
    test('chip labels drop the namespace', () => {
        expect(scopeLabel('workspace:write')).toBe('write')
        expect(scopeLabel('other')).toBe('other')
    })
})

describe('tokenState', () => {
    test('active with plenty of time left', () => {
        expect(tokenState({ expiresAt: inDays(30), revokedAt: '' }, NOW)).toBe('active')
    })
    test('expiring inside the 14-day window, not at its edge', () => {
        expect(tokenState({ expiresAt: inDays(13.9), revokedAt: '' }, NOW)).toBe('expiring')
        expect(tokenState({ expiresAt: inDays(14), revokedAt: '' }, NOW)).toBe('active')
    })
    test('expired at and after the instant', () => {
        expect(tokenState({ expiresAt: inDays(0), revokedAt: '' }, NOW)).toBe('expired')
        expect(tokenState({ expiresAt: inDays(-3), revokedAt: '' }, NOW)).toBe('expired')
    })
    test('revoked wins over expired', () => {
        expect(tokenState({ expiresAt: inDays(-3), revokedAt: inDays(-5) }, NOW)).toBe('revoked')
    })
    test('an unparseable expiry is not a reason to alarm anyone', () => {
        expect(tokenState({ expiresAt: '', revokedAt: '' }, NOW)).toBe('active')
    })
})

describe('daysLeft', () => {
    test('rounds up partial days', () => {
        expect(daysLeft(inDays(2.2), NOW)).toBe(3)
        expect(daysLeft(inDays(0.1), NOW)).toBe(1)
    })
    test('zero when expired or unparseable', () => {
        expect(daysLeft(inDays(-1), NOW)).toBe(0)
        expect(daysLeft('nope', NOW)).toBe(0)
    })
})

test('sortTokens keeps usable tokens first, preserving server order within each half', () => {
    const tokens = [
        { id: 'revoked', expiresAt: inDays(30), revokedAt: inDays(-1) },
        { id: 'a', expiresAt: inDays(30), revokedAt: '' },
        { id: 'expired', expiresAt: inDays(-1), revokedAt: '' },
        { id: 'b', expiresAt: inDays(3), revokedAt: '' },
    ]
    expect(sortTokens(tokens, NOW).map((t) => t.id)).toEqual(['a', 'b', 'revoked', 'expired'])
})

describe('form', () => {
    test('name is required and at most 100 characters', () => {
        expect(validateTokenName('  ')).toBe('required')
        expect(validateTokenName('x'.repeat(101))).toBe('tooLong')
        expect(validateTokenName(' laptop ')).toBeNull()
    })
    test('server field names map onto the form', () => {
        expect(tokenViolationField('name')).toBe('name')
        expect(tokenViolationField('scopes')).toBe('scopes')
        expect(tokenViolationField('expires_in_days')).toBe('expiresInDays')
        expect(tokenViolationField('id')).toBeNull()
    })
})

describe('the capability table', () => {
    test('covers every tool exactly once, under the tool’s own scope', () => {
        const covered = CAPABILITIES.flatMap((c) => c.tools.map((tool) => ({ tool, scope: c.scope })))
        expect(covered.map((c) => c.tool).sort()).toEqual(MCP_TOOLS.map((t) => t.name).sort())
        for (const { tool, scope } of covered) {
            expect(MCP_TOOLS.find((t) => t.name === tool)?.scope).toBe(scope)
        }
    })
    test('groups read first', () => {
        expect(capabilitiesByScope().map((g) => g.scope)).toEqual(['read', 'write'])
    })
})
