/**
 * Email Reply Functionality Tests
 * Tests the reply button logic for patient emails
 */

interface PatientEmail {
  id: string;
  to_address: string;
  from_address: string | null;
  subject: string;
  body: string;
  status: string;
  direction: "inbound" | "outbound";
  sent_at: string | null;
  created_at: string | null;
}

function getReplyDetails(viewEmail: PatientEmail) {
  const replyTo = viewEmail.direction === "inbound" 
    ? viewEmail.from_address 
    : viewEmail.to_address;
  const replySubject = viewEmail.subject?.startsWith("Re: ") 
    ? viewEmail.subject 
    : `Re: ${viewEmail.subject || ""}`;
  
  return { replyTo, replySubject };
}

// Test 1: Reply to inbound email
function testReplyToInboundEmail() {
  const inboundEmail: PatientEmail = {
    id: "test-1",
    to_address: "clinic@example.com",
    from_address: "patient@example.com",
    subject: "Question about appointment",
    body: "Hello, I have a question...",
    status: "sent",
    direction: "inbound",
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { replyTo, replySubject } = getReplyDetails(inboundEmail);
  
  console.log("Test 1: Reply to Inbound Email");
  console.log("  Input: Inbound email from patient@example.com");
  console.log(`  Expected replyTo: patient@example.com`);
  console.log(`  Actual replyTo: ${replyTo}`);
  console.log(`  Expected subject: Re: Question about appointment`);
  console.log(`  Actual subject: ${replySubject}`);
  
  const passed = replyTo === "patient@example.com" && 
                 replySubject === "Re: Question about appointment";
  console.log(`  Result: ${passed ? "PASSED ✓" : "FAILED ✗"}\n`);
  return passed;
}

// Test 2: Reply to outbound email
function testReplyToOutboundEmail() {
  const outboundEmail: PatientEmail = {
    id: "test-2",
    to_address: "patient@example.com",
    from_address: "clinic@example.com",
    subject: "Your appointment confirmation",
    body: "Dear patient, your appointment is confirmed...",
    status: "sent",
    direction: "outbound",
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { replyTo, replySubject } = getReplyDetails(outboundEmail);
  
  console.log("Test 2: Reply to Outbound Email");
  console.log("  Input: Outbound email to patient@example.com");
  console.log(`  Expected replyTo: patient@example.com`);
  console.log(`  Actual replyTo: ${replyTo}`);
  console.log(`  Expected subject: Re: Your appointment confirmation`);
  console.log(`  Actual subject: ${replySubject}`);
  
  const passed = replyTo === "patient@example.com" && 
                 replySubject === "Re: Your appointment confirmation";
  console.log(`  Result: ${passed ? "PASSED ✓" : "FAILED ✗"}\n`);
  return passed;
}

// Test 3: Reply to email with existing "Re:" prefix
function testReplyToAlreadyRepliedEmail() {
  const repliedEmail: PatientEmail = {
    id: "test-3",
    to_address: "clinic@example.com",
    from_address: "patient@example.com",
    subject: "Re: Your appointment confirmation",
    body: "Thank you for confirming...",
    status: "sent",
    direction: "inbound",
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { replyTo, replySubject } = getReplyDetails(repliedEmail);
  
  console.log("Test 3: Reply to Email with Existing Re: Prefix");
  console.log("  Input: Inbound email with subject 'Re: Your appointment confirmation'");
  console.log(`  Expected replyTo: patient@example.com`);
  console.log(`  Actual replyTo: ${replyTo}`);
  console.log(`  Expected subject: Re: Your appointment confirmation (no double Re:)`);
  console.log(`  Actual subject: ${replySubject}`);
  
  const passed = replyTo === "patient@example.com" && 
                 replySubject === "Re: Your appointment confirmation";
  console.log(`  Result: ${passed ? "PASSED ✓" : "FAILED ✗"}\n`);
  return passed;
}

// Run all tests
console.log("=== Email Reply Functionality Tests ===\n");

const test1 = testReplyToInboundEmail();
const test2 = testReplyToOutboundEmail();
const test3 = testReplyToAlreadyRepliedEmail();

const allPassed = test1 && test2 && test3;

console.log("=== Test Summary ===");
console.log(`Total tests: 3`);
console.log(`Passed: ${[test1, test2, test3].filter(Boolean).length}`);
console.log(`Failed: ${[test1, test2, test3].filter(x => !x).length}`);
console.log(`\nOverall: ${allPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"}`);

if (!allPassed) {
  process.exit(1);
}
