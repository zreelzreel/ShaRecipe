window.SUPABASE_URL = 'https://xuvlqmnyxhfafndyqxqi.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_cmdxxY4Rk4tgiTNgd2AOSQ_cmy1C-f_';

if (window.supabase?.createClient) {
    window.supabaseClient = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_KEY
    );
}
