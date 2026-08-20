import { describe, expect, test } from 'bun:test'
import { profileFromClaims } from './claims'

describe('profileFromClaims', () => {
    test('central full-JWT format: name is the username', () => {
        const p = profileFromClaims({
            sub: 'u-123',
            name: 'tomas',
            displayName: 'Tomáš',
            email: 't@example.com',
        })
        expect(p).toEqual({
            id: 'u-123',
            name: 'tomas',
            displayName: 'Tomáš',
            email: 't@example.com',
            avatar: '',
        })
    })

    test('box JWT-Standard format: preferred_username is the username, name the display name', () => {
        const p = profileFromClaims({
            sub: 'u-123',
            preferred_username: 'tomas',
            name: 'Tomáš',
            email: 't@example.com',
        })
        expect(p.name).toBe('tomas')
        expect(p.displayName).toBe('Tomáš')
    })

    test('full-JWT without displayName falls back to name, then sub', () => {
        expect(profileFromClaims({ sub: 'u-1', name: 'x' }).displayName).toBe('x')
        expect(profileFromClaims({ sub: 'u-1' }).name).toBe('u-1')
        expect(profileFromClaims({ sub: 'u-1' }).displayName).toBe('')
    })

    test('JWT-Standard without a name claim leaves display name empty, not the username', () => {
        const p = profileFromClaims({ sub: 'u-1', preferred_username: 'tomas' })
        expect(p.name).toBe('tomas')
        expect(p.displayName).toBe('')
    })
})
