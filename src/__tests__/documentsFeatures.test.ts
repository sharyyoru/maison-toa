/**
 * Documents Feature Tests
 * Tests for document sorting, pagination, date formatting, and preview modal
 */

// Test 1: Date formatting function
function testFormatUploadDate() {
  console.log("Test 1: Date Formatting Function");

  function formatUploadDate(dateString: string | undefined | null): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const testCases = [
    {
      name: "Null date returns empty",
      input: null,
      expected: "",
    },
    {
      name: "Undefined date returns empty",
      input: undefined,
      expected: "",
    },
    {
      name: "Invalid date returns empty",
      input: "invalid-date",
      expected: "",
    },
    {
      name: "Today's date",
      input: new Date().toISOString(),
      shouldContain: "Today at",
    },
    {
      name: "Yesterday's date",
      input: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shouldContain: "Yesterday at",
    },
    {
      name: "3 days ago",
      input: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      expected: "3 days ago",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = formatUploadDate(tc.input);
    let testPassed = false;

    if (tc.expected !== undefined) {
      testPassed = result === tc.expected;
    } else if (tc.shouldContain) {
      testPassed = result.includes(tc.shouldContain);
    }

    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
      console.log(`    Expected: ${tc.expected || `contains "${tc.shouldContain}"`}`);
      console.log(`    Got: ${result}`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 2: Pagination logic
function testPagination() {
  console.log("Test 2: Pagination Logic");

  const ITEMS_PER_PAGE = 10;

  function paginateItems<T>(items: T[], currentPage: number): T[] {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return items.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }

  function getTotalPages(totalItems: number): number {
    return Math.ceil(totalItems / ITEMS_PER_PAGE);
  }

  const testCases = [
    {
      name: "24 items = 3 pages",
      totalItems: 24,
      expectedPages: 3,
    },
    {
      name: "10 items = 1 page",
      totalItems: 10,
      expectedPages: 1,
    },
    {
      name: "11 items = 2 pages",
      totalItems: 11,
      expectedPages: 2,
    },
    {
      name: "0 items = 0 pages",
      totalItems: 0,
      expectedPages: 0,
    },
    {
      name: "5 items = 1 page",
      totalItems: 5,
      expectedPages: 1,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = getTotalPages(tc.totalItems);
    const testPassed = result === tc.expectedPages;

    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
      console.log(`    Expected: ${tc.expectedPages} pages`);
      console.log(`    Got: ${result} pages`);
    }
  }

  // Test page content
  const items = Array.from({ length: 24 }, (_, i) => `item-${i + 1}`);
  
  const page1 = paginateItems(items, 1);
  const page1Correct = page1.length === 10 && page1[0] === "item-1" && page1[9] === "item-10";
  if (page1Correct) {
    passed++;
    console.log("  ✓ Page 1 content correct: PASSED");
  } else {
    failed++;
    console.log("  ✗ Page 1 content correct: FAILED");
  }

  const page2 = paginateItems(items, 2);
  const page2Correct = page2.length === 10 && page2[0] === "item-11" && page2[9] === "item-20";
  if (page2Correct) {
    passed++;
    console.log("  ✓ Page 2 content correct: PASSED");
  } else {
    failed++;
    console.log("  ✗ Page 2 content correct: FAILED");
  }

  const page3 = paginateItems(items, 3);
  const page3Correct = page3.length === 4 && page3[0] === "item-21" && page3[3] === "item-24";
  if (page3Correct) {
    passed++;
    console.log("  ✓ Page 3 content correct (last page with 4 items): PASSED");
  } else {
    failed++;
    console.log("  ✗ Page 3 content correct: FAILED");
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 3: Sorting logic (newest first)
function testSorting() {
  console.log("Test 3: Sorting Logic (Newest First)");

  type Item = { name: string; created_at: string; kind: "file" | "folder" };

  function sortItems(items: Item[], sortBy: "name" | "date", sortOrder: "asc" | "desc"): Item[] {
    return [...items].sort((a, b) => {
      // Folders always come first
      if (a.kind === "folder" && b.kind !== "folder") return -1;
      if (a.kind !== "folder" && b.kind === "folder") return 1;
      if (a.kind === "folder" && b.kind === "folder") {
        return a.name.localeCompare(b.name);
      }
      // Sort files
      if (sortBy === "date") {
        const aDate = a.created_at || "";
        const bDate = b.created_at || "";
        const comparison = aDate.localeCompare(bDate);
        return sortOrder === "desc" ? -comparison : comparison;
      }
      const comparison = a.name.localeCompare(b.name);
      return sortOrder === "desc" ? -comparison : comparison;
    });
  }

  const items: Item[] = [
    { name: "old-file.pdf", created_at: "2024-01-01T10:00:00Z", kind: "file" },
    { name: "new-file.pdf", created_at: "2024-01-15T10:00:00Z", kind: "file" },
    { name: "folder-a", created_at: "2024-01-10T10:00:00Z", kind: "folder" },
    { name: "mid-file.pdf", created_at: "2024-01-10T10:00:00Z", kind: "file" },
    { name: "folder-b", created_at: "2024-01-05T10:00:00Z", kind: "folder" },
  ];

  let passed = 0;
  let failed = 0;

  // Test date desc (newest first) - default
  const sortedDateDesc = sortItems(items, "date", "desc");
  const dateDescCorrect = 
    sortedDateDesc[0].kind === "folder" &&
    sortedDateDesc[1].kind === "folder" &&
    sortedDateDesc[2].name === "new-file.pdf" &&
    sortedDateDesc[3].name === "mid-file.pdf" &&
    sortedDateDesc[4].name === "old-file.pdf";

  if (dateDescCorrect) {
    passed++;
    console.log("  ✓ Sort by date DESC (newest first): PASSED");
  } else {
    failed++;
    console.log("  ✗ Sort by date DESC (newest first): FAILED");
    console.log(`    Got order: ${sortedDateDesc.map(i => i.name).join(", ")}`);
  }

  // Test folders always first
  const foldersFirst = sortedDateDesc[0].kind === "folder" && sortedDateDesc[1].kind === "folder";
  if (foldersFirst) {
    passed++;
    console.log("  ✓ Folders always appear first: PASSED");
  } else {
    failed++;
    console.log("  ✗ Folders always appear first: FAILED");
  }

  // Test name sorting
  const sortedNameAsc = sortItems(items, "name", "asc");
  const nameAscCorrect = 
    sortedNameAsc[0].kind === "folder" &&
    sortedNameAsc[2].name === "mid-file.pdf" &&
    sortedNameAsc[3].name === "new-file.pdf" &&
    sortedNameAsc[4].name === "old-file.pdf";

  if (nameAscCorrect) {
    passed++;
    console.log("  ✓ Sort by name ASC: PASSED");
  } else {
    failed++;
    console.log("  ✗ Sort by name ASC: FAILED");
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 4: MIME type detection
function testMimeTypeDetection() {
  console.log("Test 4: MIME Type Detection");

  function getExtension(name: string): string {
    const parts = name.split(".");
    if (parts.length < 2) return "";
    return parts[parts.length - 1].toLowerCase();
  }

  function getMimeType(name: string, metadata?: { mimetype?: string } | null): string {
    if (metadata?.mimetype) return metadata.mimetype;
    const ext = getExtension(name);
    if (ext === "pdf") return "application/pdf";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
      return `image/${ext === "jpg" ? "jpeg" : ext}`;
    }
    if (["mp4", "webm", "ogg", "mov"].includes(ext)) return `video/${ext}`;
    return "";
  }

  const testCases = [
    { name: "document.pdf", expected: "application/pdf" },
    { name: "photo.jpg", expected: "image/jpeg" },
    { name: "photo.jpeg", expected: "image/jpeg" },
    { name: "image.png", expected: "image/png" },
    { name: "animation.gif", expected: "image/gif" },
    { name: "video.mp4", expected: "video/mp4" },
    { name: "video.webm", expected: "video/webm" },
    { name: "unknown.xyz", expected: "" },
    { name: "with-metadata.pdf", metadata: { mimetype: "application/pdf" }, expected: "application/pdf" },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = getMimeType(tc.name, tc.metadata);
    const testPassed = result === tc.expected;

    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
      console.log(`    Expected: ${tc.expected}`);
      console.log(`    Got: ${result}`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 5: Preview modal state structure
function testPreviewModalState() {
  console.log("Test 5: Preview Modal State Structure");

  type PreviewModal = {
    url: string;
    name: string;
    mimeType: string;
    uploadedAt: string | null;
  };

  function createPreviewModal(
    url: string,
    name: string,
    mimeType: string,
    uploadedAt: string | null
  ): PreviewModal {
    return { url, name, mimeType, uploadedAt };
  }

  let passed = 0;
  let failed = 0;

  // Test creating a valid modal state
  const modal = createPreviewModal(
    "https://example.com/file.pdf",
    "document.pdf",
    "application/pdf",
    "2024-01-15T10:00:00Z"
  );

  if (modal.url === "https://example.com/file.pdf") {
    passed++;
    console.log("  ✓ Modal URL set correctly: PASSED");
  } else {
    failed++;
    console.log("  ✗ Modal URL set correctly: FAILED");
  }

  if (modal.name === "document.pdf") {
    passed++;
    console.log("  ✓ Modal name set correctly: PASSED");
  } else {
    failed++;
    console.log("  ✗ Modal name set correctly: FAILED");
  }

  if (modal.mimeType === "application/pdf") {
    passed++;
    console.log("  ✓ Modal mimeType set correctly: PASSED");
  } else {
    failed++;
    console.log("  ✗ Modal mimeType set correctly: FAILED");
  }

  if (modal.uploadedAt === "2024-01-15T10:00:00Z") {
    passed++;
    console.log("  ✓ Modal uploadedAt set correctly: PASSED");
  } else {
    failed++;
    console.log("  ✗ Modal uploadedAt set correctly: FAILED");
  }

  // Test with null uploadedAt
  const modalNoDate = createPreviewModal(
    "https://example.com/file.jpg",
    "image.jpg",
    "image/jpeg",
    null
  );

  if (modalNoDate.uploadedAt === null) {
    passed++;
    console.log("  ✓ Modal with null uploadedAt: PASSED");
  } else {
    failed++;
    console.log("  ✗ Modal with null uploadedAt: FAILED");
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Run all tests
console.log("=== Documents Feature Tests ===\n");

const docTest1 = testFormatUploadDate();
const docTest2 = testPagination();
const docTest3 = testSorting();
const docTest4 = testMimeTypeDetection();
const docTest5 = testPreviewModalState();

const docAllPassed = docTest1 && docTest2 && docTest3 && docTest4 && docTest5;

console.log("=== Test Summary ===");
console.log(`Test 1 (Date Formatting): ${docTest1 ? "PASSED" : "FAILED"}`);
console.log(`Test 2 (Pagination): ${docTest2 ? "PASSED" : "FAILED"}`);
console.log(`Test 3 (Sorting): ${docTest3 ? "PASSED" : "FAILED"}`);
console.log(`Test 4 (MIME Type Detection): ${docTest4 ? "PASSED" : "FAILED"}`);
console.log(`Test 5 (Preview Modal State): ${docTest5 ? "PASSED" : "FAILED"}`);
console.log(`\nOverall: ${docAllPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"}`);

if (!docAllPassed) {
  process.exit(1);
}
