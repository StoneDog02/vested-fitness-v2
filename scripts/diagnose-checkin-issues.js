#!/usr/bin/env node

/**
 * Diagnostic script to help identify check-in form submission issues
 * Run with: node scripts/diagnose-checkin-issues.js
 */

/* eslint-env node */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function diagnoseCheckInIssues() {
  console.log('🔍 Diagnosing Check-In Form Issues...\n');

  try {
    // 1. Check database schema
    console.log('1. Checking database schema...');
    
    // Check if tables exist
    const tables = ['check_in_forms', 'check_in_form_questions', 'check_in_form_instances', 'check_in_form_responses'];
    
    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`❌ Table ${table}: ${error.message}`);
      } else {
        console.log(`✅ Table ${table}: OK`);
      }
    }

    // 2. Check recent form instances
    console.log('\n2. Checking recent form instances...');
    const { data: instances, error: instancesError } = await supabase
      .from('check_in_form_instances')
      .select(`
        id,
        status,
        sent_at,
        expires_at,
        check_in_forms!inner (title),
        users!check_in_form_instances_client_id_fkey (name, role)
      `)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (instancesError) {
      console.log(`❌ Error fetching instances: ${instancesError.message}`);
    } else {
      console.log(`✅ Found ${instances.length} recent form instances`);
      let expiredCount = 0;
      let pendingCount = 0;
      
      instances.forEach(instance => {
        const isExpired = instance.expires_at && new Date(instance.expires_at) < new Date();
        if (isExpired) expiredCount++;
        if (instance.status === 'sent' && !isExpired) pendingCount++;
        
        console.log(`  - ${instance.check_in_forms.title} (${instance.status}) ${isExpired ? 'EXPIRED' : ''}`);
      });
      
      console.log(`\n📊 Summary: ${expiredCount} expired, ${pendingCount} pending`);
    }

    // 3. Check recent responses
    console.log('\n3. Checking recent form responses...');
    const { data: responses, error: responsesError } = await supabase
      .from('check_in_form_responses')
      .select(`
        id,
        created_at,
        check_in_form_instances!inner (
          check_in_forms!inner (title)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (responsesError) {
      console.log(`❌ Error fetching responses: ${responsesError.message}`);
    } else {
      console.log(`✅ Found ${responses.length} recent form responses`);
    }

    // 4. Check for orphaned data
    console.log('\n4. Checking for orphaned data...');
    
    // Check for instances without forms
    const { data: orphanedInstances, error: orphanedError } = await supabase
      .from('check_in_form_instances')
      .select('id, form_id')
      .is('form_id', null);

    if (orphanedError) {
      console.log(`❌ Error checking orphaned instances: ${orphanedError.message}`);
    } else if (orphanedInstances.length > 0) {
      console.log(`⚠️  Found ${orphanedInstances.length} orphaned form instances`);
    } else {
      console.log('✅ No orphaned form instances found');
    }

    // 5. Check storage bucket
    console.log('\n5. Checking storage bucket...');
    const { data: files, error: filesError } = await supabase.storage
      .from('checkin-media')
      .list('checkins', { limit: 5 });

    if (filesError) {
      console.log(`❌ Error accessing storage: ${filesError.message}`);
    } else {
      console.log(`✅ Storage bucket accessible, found ${files.length} files`);
    }

    // 6. Check user roles
    console.log('\n6. Checking user roles...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, role, auth_id')
      .in('role', ['coach', 'client'])
      .limit(10);

    if (usersError) {
      console.log(`❌ Error fetching users: ${usersError.message}`);
    } else {
      const coaches = users.filter(u => u.role === 'coach');
      const clients = users.filter(u => u.role === 'client');
      console.log(`✅ Found ${coaches.length} coaches and ${clients.length} clients`);
    }

    console.log('\n🎯 Diagnosis complete!');
    console.log('\nCommon issues to check:');
    console.log('1. Authentication cookies expired');
    console.log('2. Form instances expired');
    console.log('3. Missing required questions');
    console.log('4. Network connectivity issues');
    console.log('5. Browser console errors');

  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  }
}

// Run the diagnosis
diagnoseCheckInIssues();
