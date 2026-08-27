import { describe, expect, test } from 'bun:test'
import { CAPABILITY_SCOPE, connectionCovers } from './googleOAuth'

describe('connectionCovers', () => {
    const drive = CAPABILITY_SCOPE.drive
    const sheets = 'https://www.googleapis.com/auth/spreadsheets.readonly'

    test('a Sheets-only account does not cover a Drive source', () => {
        expect(connectionCovers(['openid', 'email', sheets], 'drive')).toBe(false)
    })

    test('an account that consented to Drive does', () => {
        expect(connectionCovers(['openid', 'email', sheets, drive], 'drive')).toBe(true)
    })

    test('no recorded scopes reads as unknown, not as "nothing granted"', () => {
        // Every connection made before scopes were tracked has an empty list.
        // Marking those incapable would tell a customer their working
        // connection is broken on the strength of a measurement nobody took —
        // and the server takes the same view (Connection.HasGoogleScope).
        expect(connectionCovers([], 'drive')).toBe(true)
    })

    test('a source needing nothing extra is covered by anything', () => {
        expect(connectionCovers([], '')).toBe(true)
        expect(connectionCovers(['openid'], '')).toBe(true)
    })

    test('the Drive scope is the non-restricted one', () => {
        // drive.readonly is a Google *restricted* scope: asking for it would
        // put the customer's own OAuth app in front of a third-party security
        // assessment. drive.file reaches the files they point us at.
        expect(drive).toBe('https://www.googleapis.com/auth/drive.file')
    })
})
