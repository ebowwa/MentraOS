#!/usr/bin/env bun

/**
 * Test script to verify Cloudflare Stream API credentials and permissions
 * This script will test the connection and list required permissions
 */

import axios from 'axios';

async function testCloudflareConnection() {
  console.log('🔧 Testing Cloudflare Stream API Connection\n');
  
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  
  if (!accountId || !apiToken) {
    console.error('❌ Missing Cloudflare credentials in environment');
    console.error('   Required: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }
  
  console.log(`📋 Account ID: ${accountId}`);
  console.log(`🔑 API Token: ${apiToken.substring(0, 10)}...${apiToken.substring(apiToken.length - 5)}\n`);
  
  // Test 1: Verify token permissions
  console.log('1️⃣ Testing token permissions...');
  try {
    const tokenVerifyResponse = await axios.get('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (tokenVerifyResponse.data.success) {
      console.log('✅ Token is valid');
      console.log(`   Status: ${tokenVerifyResponse.data.result.status}`);
      console.log(`   ID: ${tokenVerifyResponse.data.result.id}`);
    } else {
      console.error('❌ Token verification failed');
    }
  } catch (error: any) {
    console.error('❌ Token verification error:', error.response?.data || error.message);
  }
  
  console.log('\n2️⃣ Testing Stream API access...');
  try {
    // Test listing live inputs
    const streamResponse = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          per_page: 1
        }
      }
    );
    
    if (streamResponse.data.success) {
      console.log('✅ Stream API access successful');
      console.log(`   Total live inputs: ${streamResponse.data.result_info?.total_count || 0}`);
    } else {
      console.error('❌ Stream API access failed:', streamResponse.data.errors);
    }
  } catch (error: any) {
    console.error('❌ Stream API error:', error.response?.data || error.message);
    
    if (error.response?.status === 403) {
      console.error('\n⚠️  403 Authentication Error - Your token needs the following permissions:');
      console.error('   - Account:Stream:Read');
      console.error('   - Account:Stream:Write');
      console.error('\n   To fix this:');
      console.error('   1. Go to https://dash.cloudflare.com/profile/api-tokens');
      console.error('   2. Edit your token or create a new one');
      console.error('   3. Under "Account Permissions", add:');
      console.error('      - Stream:Read');
      console.error('      - Stream:Write');
      console.error('   4. Save and update the CLOUDFLARE_API_TOKEN in your .env file');
    }
  }
  
  console.log('\n3️⃣ Testing Stream creation permissions...');
  try {
    // Try to create a test live input
    const requestBody = {};
    
    console.log('   Request body:', JSON.stringify(requestBody, null, 2));
    
    const createResponse = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (createResponse.data.success) {
      console.log('✅ Stream creation successful');
      const liveInput = createResponse.data.result;
      console.log(`   Created test stream: ${liveInput.uid}`);
      
      // Clean up - delete the test stream
      console.log('   Cleaning up test stream...');
      await axios.delete(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${liveInput.uid}`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('   ✅ Test stream deleted');
    }
  } catch (error: any) {
    console.error('❌ Stream creation error:', error.response?.data || error.message);
  }
  
  console.log('\n4️⃣ Testing Images API access (for photo uploads)...');
  try {
    const imagesResponse = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          per_page: 1
        }
      }
    );
    
    if (imagesResponse.data.success) {
      console.log('✅ Images API access successful');
    } else {
      console.error('❌ Images API access failed:', imagesResponse.data.errors);
    }
  } catch (error: any) {
    console.error('❌ Images API error:', error.response?.data || error.message);
    
    if (error.response?.status === 403) {
      console.error('\n⚠️  Images API requires additional permissions:');
      console.error('   - Account:Cloudflare Images:Read');
      console.error('   - Account:Cloudflare Images:Write');
    }
  }
  
  console.log('\n📊 Summary of Required Permissions:');
  console.log('   For RTMP Streaming:');
  console.log('   - Account → Stream:Read');
  console.log('   - Account → Stream:Write');
  console.log('\n   For Photo Uploads:');
  console.log('   - Account → Cloudflare Images:Read');
  console.log('   - Account → Cloudflare Images:Write');
  
  console.log('\n✅ Test complete!');
}

// Run the test
testCloudflareConnection().catch(console.error);