import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const adminAuthClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

const publicAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function test() {
    const email = 'test_signup_flow@gmail.com'
    const password = 'Password@12345'

    console.log('1. Creating user...')
    const { data: createdUser, error: createErr } = await adminAuthClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    })

    if (createErr) {
        console.error('Create error:', createErr)
        return
    }
    console.log('User created:', createdUser.user.id)

    console.log('2. Attempting to sign in...')
    const { data: session, error: signErr } = await publicAuthClient.auth.signInWithPassword({
        email,
        password
    })

    if (signErr) {
        console.error('Sign in error:', signErr)
    } else {
        console.log('Sign in success!')
    }

    // Cleanup
    await adminAuthClient.auth.admin.deleteUser(createdUser.user.id)
    console.log('User cleaned up.')
}

test()
