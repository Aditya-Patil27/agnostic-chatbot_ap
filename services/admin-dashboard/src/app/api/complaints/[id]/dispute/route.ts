import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const publicId = params.id;
    const body = await request.json();
    const reason = body.reason || "Citizen disputed resolution";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch the master ID based on the public ID (tracking ID)
    // Here we query complain_reports to find the matching master_id
    // But in our mock structure, trackingId might be the ID directly, or mapped.
    // Let's assume trackingId refers to complaints_master.id for simplicity if it's a UUID,
    // or we're matching it to a reference. In standard we query the API directly.
    const { data: complaint, error: fetchError } = await supabase
      .from('complaints_master')
      .select('id, status')
      .eq('id', publicId)
      .single();

    if (fetchError || !complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    if (complaint.status !== 'resolved' && complaint.status !== 'Resolved') {
      return NextResponse.json({ error: 'Only resolved complaints can be disputed' }, { status: 400 });
    }

    // 2. Insert into disputes table
    const { error: disputeError } = await supabase
      .from('disputes')
      .insert({
        master_id: complaint.id,
        reporter_id: '00000000-0000-0000-0000-000000000000', // Mock citizen ID
        reason: reason,
        outcome: 'pending'
      });

    if (disputeError) {
      console.error('Failed to insert dispute:', disputeError);
      return NextResponse.json({ error: 'Failed to record dispute' }, { status: 500 });
    }

    // 3. Update master status to "disputed" (or "in_progress" depending on ENUM)
    // Our ENUM complaint_status has 'filed', 'assigned', 'in_progress', 'resolved', 'escalated', 'closed'
    // So we'll map it back to `in_progress` or `escalated`. Let's use `escalated`.
    const { error: updateError } = await supabase
      .from('complaints_master')
      .update({ status: 'escalated' })
      .eq('id', complaint.id);

    if (updateError) {
      console.error('Failed to update status:', updateError);
    }

    // 4. Record event log
    await supabase
      .from('complaint_events')
      .insert({
        master_id: complaint.id,
        event_type: 'STATUS_CHANGE',
        metadata: { new_status: 'escalated', reason: reason, note: 'Citizen disputed resolution' }
      });

    return NextResponse.json({ message: 'Dispute recorded successfully, ticket escalated.' });
  } catch (error) {
    console.error('Dispute API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
