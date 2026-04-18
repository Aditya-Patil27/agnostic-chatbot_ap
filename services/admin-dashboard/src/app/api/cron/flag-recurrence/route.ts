import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Haversine formula to calculate distance between two coordinates in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch complaints from the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: complaints, error: fetchError } = await supabase
      .from('complaints_master')
      .select('id, category, latitude, longitude, created_at, status')
      .gte('created_at', sixMonthsAgo.toISOString());

    if (fetchError || !complaints) {
      return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 });
    }

    const clusters: Array<any[]> = [];
    const thresholdMeters = 100; // 100m radius

    // 2. Identify Recurrence Clusters (O(N^2) naive approach for demo scale)
    const visited = new Set<string>();

    for (let i = 0; i < complaints.length; i++) {
      const c1 = complaints[i];
      if (visited.has(c1.id) || !c1.latitude || !c1.longitude) continue;

      const cluster = [c1];
      visited.add(c1.id);

      for (let j = i + 1; j < complaints.length; j++) {
        const c2 = complaints[j];
        if (visited.has(c2.id) || !c2.latitude || !c2.longitude) continue;

        // Same category and within threshold
        if (c1.category === c2.category) {
          const dist = getDistance(c1.latitude, c1.longitude, c2.latitude, c2.longitude);
          if (dist <= thresholdMeters) {
            cluster.push(c2);
            visited.add(c2.id);
          }
        }
      }

      // If issue recurred 3 or more times
      if (cluster.length >= 3) {
        clusters.push(cluster);
      }
    }

    const flagsInserted = [];

    // 3. Insert into recurrence_flags
    for (const cluster of clusters) {
      // Use the most recent complaint as the master_id anchor
      cluster.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const anchor = cluster[0];

      // Check if already flagged recently
      const { data: existingFlags } = await supabase
        .from('recurrence_flags')
        .select('id')
        .eq('master_id', anchor.id)
        .single();
      
      if (!existingFlags) {
        const recommendedAction = cluster[0].category === 'Roads & Infrastructure' || cluster[0].category === 'Pothole'
          ? "Audit Contractor Material Quality - Repeated Structural Failures"
          : "Perform Comprehensive System Review - High Recurrence Rate";

        const { data: newFlag, error: flagError } = await supabase
          .from('recurrence_flags')
          .insert({
            master_id: anchor.id,
            recurrence_count: cluster.length,
            time_window_days: 180,
            recommended_action: recommendedAction
          })
          .select();

        if (!flagError && newFlag) {
          flagsInserted.push(newFlag[0]);
        }
      }
    }

    return NextResponse.json({ 
      message: 'Recurrence engine executed successfully',
      clustersFound: clusters.length,
      newFlags: flagsInserted.length
    });

  } catch (error) {
    console.error('Recurrence Engine Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
