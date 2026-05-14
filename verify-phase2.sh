#!/bin/bash
# Phase 2 Manual Verification Script
# Run this from WSL terminal: bash verify-phase2.sh

echo "=========================================="
echo "Phase 2 Verification Script"
echo "=========================================="
echo ""

# Check if server is running
echo "1. Checking if server is running..."
if curl -s http://localhost:3000/health > /dev/null; then
    echo "   ✅ Server is running"
else
    echo "   ❌ Server is not running"
    echo "   Start server with: npm run dev"
    exit 1
fi
echo ""

# Test WASM file serving
echo "2. Testing WASM file serving..."
WASM_RESPONSE=$(curl -s -I http://localhost:3000/circuits/age_check_js/age_check.wasm)
if echo "$WASM_RESPONSE" | grep -q "200 OK"; then
    echo "   ✅ WASM file returns 200 OK"
else
    echo "   ❌ WASM file not accessible"
fi

if echo "$WASM_RESPONSE" | grep -q "application/wasm"; then
    echo "   ✅ Content-Type is application/wasm"
else
    echo "   ❌ Content-Type is not application/wasm"
fi

if echo "$WASM_RESPONSE" | grep -q "max-age=31536000"; then
    echo "   ✅ Cache headers are set correctly"
else
    echo "   ❌ Cache headers are missing or incorrect"
fi
echo ""

# Test zkey file serving
echo "3. Testing zkey file serving..."
ZKEY_RESPONSE=$(curl -s -I http://localhost:3000/keys/age_check_0.zkey)
if echo "$ZKEY_RESPONSE" | grep -q "200 OK"; then
    echo "   ✅ zkey file returns 200 OK"
else
    echo "   ❌ zkey file not accessible"
fi

if echo "$ZKEY_RESPONSE" | grep -q "max-age=31536000"; then
    echo "   ✅ Cache headers are set correctly"
else
    echo "   ❌ Cache headers are missing or incorrect"
fi
echo ""

# Test HTML page
echo "4. Testing HTML page..."
HTML_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/test-proof.html)
if [ "$HTML_RESPONSE" = "200" ]; then
    echo "   ✅ test-proof.html is accessible"
else
    echo "   ❌ test-proof.html not accessible (got $HTML_RESPONSE)"
fi
echo ""

# Test JS module
echo "5. Testing JS module..."
JS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/js/zkProofGenerator.js)
if [ "$JS_RESPONSE" = "200" ]; then
    echo "   ✅ zkProofGenerator.js is accessible"
else
    echo "   ❌ zkProofGenerator.js not accessible (got $JS_RESPONSE)"
fi
echo ""

# Run tests
echo "6. Running test suite..."
npm test > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ All tests pass"
else
    echo "   ❌ Some tests failed"
    echo "   Run 'npm test' for details"
fi
echo ""

echo "=========================================="
echo "Automated checks complete!"
echo ""
echo "Manual verification required:"
echo "1. Open http://localhost:3000/test-proof.html in browser"
echo "2. Open DevTools → Network tab"
echo "3. Generate a proof and verify:"
echo "   - Age value does NOT appear in any request"
echo "   - Proof generation completes successfully"
echo "   - Compliance check returns compliant: true"
echo "=========================================="
