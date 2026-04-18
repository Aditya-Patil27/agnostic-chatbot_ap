import { createClient } from '@supabase/supabase-js';

// Setup basic env for script if run via node directly with dotenv, or assume env is loaded via tsx
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY. Run with: npx tsx --env-file=.env.local scripts/seed_recurrence_mock_data.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HOTSPOTS = [
  { lat: 18.559, lng: 73.779, category: 'Pothole', title: 'Baner Main Rd Pothole' },
  { lat: 18.591, lng: 73.738, category: 'Electrical', title: 'Sector 4 Streetlights' },
  { lat: 18.5204, lng: 73.8567, category: 'Garbage', title: 'Shivaji Nagar Dump' }
];

async function seed() {
  console.log("Seeding synthetic recurrence data...");

  const syntheticComplaints = [];

  for (let i = 0; i < 150; i++) {
    const isRecurring = Math.random() < 0.3; // 30% chance to be part of a hotspot
    let lat, lng, category, title;

    if (isRecurring) {
      const hotspot = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
      // Add slight jitter (within ~50m)
      lat = hotspot.lat + (Math.random() - 0.5) * 0.0005;
      lng = hotspot.lng + (Math.random() - 0.5) * 0.0005;
      category = hotspot.category;
      title = `${hotspot.title} (Mock ${i})`;
    } else {
      // General random location in Pune
      lat = 18.5204 + (Math.random() - 0.5) * 0.1;
      lng = 73.8567 + (Math.random() - 0.5) * 0.1;
      category = ['Water & Sanitation', 'Roads & Infrastructure', 'Electrical', 'Garbage'][Math.floor(Math.random() * 4)];
      title = `General Issue ${i}`;
    }

    // Historical date between now and 6 months ago
    const daysAgo = Math.floor(Math.random() * 180);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);

    syntheticComplaints.push({
      category,
      description: `[${title}] Synthetic data seeded for SIH demo. Log ${i}`,
      severity: Math.floor(Math.random() * 5) + 5,
      priority_score: Math.floor(Math.random() * 100),
      department_id: `dept_${Math.floor(Math.random() * 3)}`,
      status: ['resolved', 'closed'][Math.floor(Math.random() * 2)],
      latitude: lat,
      longitude: lng,
      sla_due_at: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: createdAt.toISOString()
    });
  }

  // Insert in batches of 50
  for (let i = 0; i < syntheticComplaints.length; i += 50) {
    const batch = syntheticComplaints.slice(i, i + 50);
    const { error } = await supabase.from('complaints_master').insert(batch);
    if (error) {
      console.error(`Error inserting batch ${i / 50}:`, error);
    } else {
      console.log(`Successfully inserted batch ${i / 50 + 1}/3...`);
    }
  }

  console.log("✅ Seed complete! You can now run the Recurrence Engine endpoint (POST /api/cron/flag-recurrence) to detect these hotspots.");
}

seed();
