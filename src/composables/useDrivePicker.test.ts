import { describe, expect, test } from 'bun:test'
import { appIdFromClientId } from './useDrivePicker'

describe('appIdFromClientId', () => {
    test('takes the project number off a Google client id', () => {
        // The Picker needs an "app id" to match the pick against the OAuth
        // client's project. It is the client id's numeric prefix, so the
        // customer never has to find and paste a second identifier.
        expect(appIdFromClientId('123456789012-abc123.apps.googleusercontent.com')).toBe('123456789012')
    })

    test('answers empty for anything that is not one', () => {
        // Empty is the signal to report the picker unavailable and leave the
        // paste-a-link field alone — never to open a picker Google refuses.
        expect(appIdFromClientId('')).toBe('')
        expect(appIdFromClientId('not-a-client-id')).toBe('')
        expect(appIdFromClientId('abc-123.apps.googleusercontent.com')).toBe('')
    })
})
