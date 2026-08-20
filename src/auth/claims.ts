// Maps a Casdoor access-token payload to the profile fields the Console
// displays. Casdoor has two token formats and they disagree about `name`:
//
// - the full "JWT" format embeds the user object: `name` is the USERNAME,
//   `displayName` the display name;
// - OIDC "JWT-Standard" (the usual workspace configuration — the full format
//   bloats every request header): `preferred_username` is the username and
//   `name` is the DISPLAY name.
//
// `preferred_username` only exists in the latter, so its presence is the
// discriminator — the same rule workspace-api uses for commit attribution.
// Getting this backwards is silent: names still render, just wrong.

export interface ProfileClaims {
    id: string
    name: string
    displayName: string
    email: string
    avatar: string
}

export function profileFromClaims(payload: Record<string, unknown>): ProfileClaims {
    const sub = (payload.sub as string) ?? ''
    const isStandard = typeof payload.preferred_username === 'string'
    return {
        id: sub,
        name: isStandard
            ? (payload.preferred_username as string)
            : (payload.name as string) || sub,
        displayName: isStandard
            ? (payload.name as string) || ''
            : (payload.displayName as string) || (payload.name as string) || '',
        email: (payload.email as string) || '',
        avatar: (payload.avatar as string) || '',
    }
}
