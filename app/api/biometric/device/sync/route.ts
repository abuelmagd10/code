import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
    // Initialize Supabase client inside handler to avoid build-time env var errors
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // This endpoint is hit by an Admin from the ERP dashboard to manually pull from a device
    try {
        const { device_id, company_id } = await request.json();

        if (!device_id || !company_id) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // 1. Fetch Device Credentials
        const { data: device, error } = await supabase
            .from('biometric_devices')
            .select('*')
            .eq('id', device_id)
            .eq('company_id', company_id) // Governance
            .single();

        if (error || !device) {
            return NextResponse.json({ error: 'Device not found or access denied' }, { status: 404 });
        }

        if (device.sync_mode !== 'pull' && device.sync_mode !== 'hybrid') {
            return NextResponse.json({ error: 'Device does not support Pull operations' }, { status: 400 });
        }

        // 2. Mock Device Communication
        // In a real ERP, we would use a Node.js ZKTeco library to connect to device.device_ip
        // e.g., const zkInstance = new ZKLib(device.device_ip, 4370);
        // await zkInstance.connect();
        // const logs = await zkInstance.getAttendances();
        console.log(`[Sync Emulation] Connecting to device IP: ${device.device_ip}...`);

        // Simulate finding 0 new logs for the sync
        const simulatedLogsCount = 0;

        // 3. Update Sync Timestamp
        await supabase.from('biometric_devices').update({ last_sync_at: new Date().toISOString() }).eq('id', device.id);

        return NextResponse.json({
            message: 'Sync command executed successfully',
            device_name: device.device_name,
            logs_pulled: simulatedLogsCount
        });

    } catch (err: any) {
        console.error('Biometric Sync API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
