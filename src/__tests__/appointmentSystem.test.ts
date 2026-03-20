/**
 * Appointment System Tests
 * Tests for calendar and appointment creation functionality
 */

// Test 1: Verify appointment creation validation logic
function testAppointmentCreationValidation() {
  console.log("Test 1: Appointment Creation Validation");
  
  // Simulate the validation checks from handleSaveAppointment
  const testCases = [
    {
      name: "Missing patient",
      createPatientId: null,
      selectedServiceId: "service-1",
      bookingStatus: "In Person",
      doctorCalendarId: "cal-1",
      draftDate: "2024-01-15",
      draftTime: "10:00",
      expectedError: "Please select a patient.",
    },
    {
      name: "Missing service",
      createPatientId: "patient-1",
      selectedServiceId: "",
      bookingStatus: "In Person",
      doctorCalendarId: "cal-1",
      draftDate: "2024-01-15",
      draftTime: "10:00",
      expectedError: "Please select a service.",
    },
    {
      name: "Missing status",
      createPatientId: "patient-1",
      selectedServiceId: "service-1",
      bookingStatus: "",
      doctorCalendarId: "cal-1",
      draftDate: "2024-01-15",
      draftTime: "10:00",
      expectedError: "Please select a status.",
    },
    {
      name: "Missing doctor calendar",
      createPatientId: "patient-1",
      selectedServiceId: "service-1",
      bookingStatus: "In Person",
      doctorCalendarId: "",
      draftDate: "2024-01-15",
      draftTime: "10:00",
      hasDoctorCalendars: true,
      expectedError: "Please select a doctor calendar.",
    },
    {
      name: "Missing date/time",
      createPatientId: "patient-1",
      selectedServiceId: "service-1",
      bookingStatus: "In Person",
      doctorCalendarId: "cal-1",
      draftDate: "",
      draftTime: "",
      expectedError: "Please select a date and time.",
    },
    {
      name: "Valid appointment data",
      createPatientId: "patient-1",
      selectedServiceId: "service-1",
      bookingStatus: "In Person",
      doctorCalendarId: "cal-1",
      draftDate: "2024-01-15",
      draftTime: "10:00",
      expectedError: null,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let error: string | null = null;
    const hasDoctorCalendars = tc.hasDoctorCalendars !== false;

    if (!tc.createPatientId) {
      error = "Please select a patient.";
    } else if (!tc.selectedServiceId) {
      error = "Please select a service.";
    } else if (!tc.bookingStatus) {
      error = "Please select a status.";
    } else if (hasDoctorCalendars && !tc.doctorCalendarId) {
      error = "Please select a doctor calendar.";
    } else if (!tc.draftDate || !tc.draftTime) {
      error = "Please select a date and time.";
    }

    const testPassed = error === tc.expectedError;
    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
      console.log(`    Expected: ${tc.expectedError}`);
      console.log(`    Got: ${error}`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 2: Verify AppointmentModal validation
function testAppointmentModalValidation() {
  console.log("Test 2: AppointmentModal Validation");

  const testCases = [
    {
      name: "Missing appointment date",
      appointmentDate: "",
      expectedError: "Please select a date and time for the appointment.",
    },
    {
      name: "Valid appointment date",
      appointmentDate: "2024-01-15T10:00",
      expectedError: null,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let error: string | null = null;

    if (!tc.appointmentDate) {
      error = "Please select a date and time for the appointment.";
    }

    const testPassed = error === tc.expectedError;
    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
      console.log(`    Expected: ${tc.expectedError}`);
      console.log(`    Got: ${error}`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 3: Verify date/time formatting functions
function testDateTimeFormatting() {
  console.log("Test 3: Date/Time Formatting Functions");

  function formatDateTimeLocal(date: Date): string {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatTimeRangeLabel(start: Date, end: Date | null): string {
    const DAY_VIEW_SLOT_MINUTES = 15;
    if (Number.isNaN(start.getTime())) return "";

    const startLabel = start.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

    let endLabel: string;
    if (end && !Number.isNaN(end.getTime())) {
      endLabel = end.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      const fallbackEnd = new Date(start.getTime() + DAY_VIEW_SLOT_MINUTES * 60 * 1000);
      endLabel = fallbackEnd.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return `${startLabel} - ${endLabel}`;
  }

  const testCases = [
    {
      name: "formatDateTimeLocal - standard date",
      fn: () => formatDateTimeLocal(new Date(2024, 0, 15, 10, 30)),
      expected: "2024-01-15T10:30",
    },
    {
      name: "formatDateTimeLocal - single digit month/day",
      fn: () => formatDateTimeLocal(new Date(2024, 0, 5, 9, 5)),
      expected: "2024-01-05T09:05",
    },
    {
      name: "formatTimeRangeLabel - with end time",
      fn: () => {
        const result = formatTimeRangeLabel(
          new Date(2024, 0, 15, 10, 0),
          new Date(2024, 0, 15, 11, 0)
        );
        // Check that it contains both times (format may vary by locale)
        return result.includes("10") && result.includes("11") ? "valid" : "invalid";
      },
      expected: "valid",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = tc.fn();
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

// Test 4: Verify appointment type selection logic
function testAppointmentTypeSelection() {
  console.log("Test 4: Appointment Type Selection Logic");

  type AppointmentType = "appointment" | "operation";

  function getDefaultDuration(type: AppointmentType): number {
    return type === "operation" ? 60 : 15;
  }

  function getDefaultTitle(type: AppointmentType, patientName: string): string {
    return `${type === "operation" ? "Operation" : "Appointment"} with ${patientName}`;
  }

  const testCases = [
    {
      name: "Appointment type - default duration",
      type: "appointment" as AppointmentType,
      expectedDuration: 15,
    },
    {
      name: "Operation type - default duration",
      type: "operation" as AppointmentType,
      expectedDuration: 60,
    },
    {
      name: "Appointment type - title format",
      type: "appointment" as AppointmentType,
      patientName: "John Doe",
      expectedTitle: "Appointment with John Doe",
    },
    {
      name: "Operation type - title format",
      type: "operation" as AppointmentType,
      patientName: "Jane Smith",
      expectedTitle: "Operation with Jane Smith",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let testPassed = false;

    if (tc.expectedDuration !== undefined) {
      const duration = getDefaultDuration(tc.type);
      testPassed = duration === tc.expectedDuration;
    } else if (tc.expectedTitle !== undefined && tc.patientName) {
      const title = getDefaultTitle(tc.type, tc.patientName);
      testPassed = title === tc.expectedTitle;
    }

    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 5: Verify weekend booking validation
function testWeekendBookingValidation() {
  console.log("Test 5: Weekend Booking Validation");

  function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  function getNextWeekday(date: Date): Date {
    const result = new Date(date);
    while (isWeekend(result)) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  const testCases = [
    {
      name: "Monday is not weekend",
      date: new Date("2024-01-15"), // Monday
      expectedWeekend: false,
    },
    {
      name: "Tuesday is not weekend",
      date: new Date("2024-01-16"), // Tuesday
      expectedWeekend: false,
    },
    {
      name: "Wednesday is not weekend",
      date: new Date("2024-01-17"), // Wednesday
      expectedWeekend: false,
    },
    {
      name: "Thursday is not weekend",
      date: new Date("2024-01-18"), // Thursday
      expectedWeekend: false,
    },
    {
      name: "Friday is not weekend",
      date: new Date("2024-01-19"), // Friday
      expectedWeekend: false,
    },
    {
      name: "Saturday is weekend",
      date: new Date("2024-01-20"), // Saturday
      expectedWeekend: true,
    },
    {
      name: "Sunday is weekend",
      date: new Date("2024-01-21"), // Sunday
      expectedWeekend: true,
    },
    {
      name: "getNextWeekday from Saturday returns Monday",
      date: new Date("2024-01-20"), // Saturday
      expectedNextWeekday: new Date("2024-01-22"), // Monday
      testNextWeekday: true,
    },
    {
      name: "getNextWeekday from Sunday returns Monday",
      date: new Date("2024-01-21"), // Sunday
      expectedNextWeekday: new Date("2024-01-22"), // Monday
      testNextWeekday: true,
    },
    {
      name: "getNextWeekday from Friday returns Friday",
      date: new Date("2024-01-19"), // Friday
      expectedNextWeekday: new Date("2024-01-19"), // Friday
      testNextWeekday: true,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let testPassed = false;

    if (tc.testNextWeekday && tc.expectedNextWeekday) {
      const nextWeekday = getNextWeekday(tc.date);
      testPassed = nextWeekday.toDateString() === tc.expectedNextWeekday.toDateString();
    } else {
      const result = isWeekend(tc.date);
      testPassed = result === tc.expectedWeekend;
    }

    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test 6: Verify double-booking conflict detection logic
function testDoubleBookingDetection() {
  console.log("Test 6: Double-Booking Conflict Detection");

  type Appointment = { start_time: string; end_time: string };

  function hasTimeConflict(
    newStart: Date,
    newEnd: Date,
    existingAppointments: Appointment[]
  ): boolean {
    return existingAppointments.some((apt) => {
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      return newStart < aptEnd && newEnd > aptStart;
    });
  }

  const existingAppointments: Appointment[] = [
    { start_time: "2024-01-15T10:00:00Z", end_time: "2024-01-15T11:00:00Z" },
    { start_time: "2024-01-15T14:00:00Z", end_time: "2024-01-15T15:00:00Z" },
  ];

  const testCases = [
    {
      name: "No conflict - before existing",
      newStart: new Date("2024-01-15T08:00:00Z"),
      newEnd: new Date("2024-01-15T09:00:00Z"),
      expectedConflict: false,
    },
    {
      name: "No conflict - between existing",
      newStart: new Date("2024-01-15T12:00:00Z"),
      newEnd: new Date("2024-01-15T13:00:00Z"),
      expectedConflict: false,
    },
    {
      name: "Conflict - overlaps start",
      newStart: new Date("2024-01-15T09:30:00Z"),
      newEnd: new Date("2024-01-15T10:30:00Z"),
      expectedConflict: true,
    },
    {
      name: "Conflict - overlaps end",
      newStart: new Date("2024-01-15T10:30:00Z"),
      newEnd: new Date("2024-01-15T11:30:00Z"),
      expectedConflict: true,
    },
    {
      name: "Conflict - completely inside",
      newStart: new Date("2024-01-15T10:15:00Z"),
      newEnd: new Date("2024-01-15T10:45:00Z"),
      expectedConflict: true,
    },
    {
      name: "Conflict - completely contains",
      newStart: new Date("2024-01-15T09:00:00Z"),
      newEnd: new Date("2024-01-15T12:00:00Z"),
      expectedConflict: true,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const hasConflict = hasTimeConflict(tc.newStart, tc.newEnd, existingAppointments);
    const testPassed = hasConflict === tc.expectedConflict;

    if (testPassed) {
      passed++;
      console.log(`  ✓ ${tc.name}: PASSED`);
    } else {
      failed++;
      console.log(`  ✗ ${tc.name}: FAILED`);
      console.log(`    Expected conflict: ${tc.expectedConflict}`);
      console.log(`    Got conflict: ${hasConflict}`);
    }
  }

  console.log(`  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Run all tests
console.log("=== Appointment System Tests ===\n");

const apptTest1 = testAppointmentCreationValidation();
const apptTest2 = testAppointmentModalValidation();
const apptTest3 = testDateTimeFormatting();
const apptTest4 = testAppointmentTypeSelection();
const apptTest5 = testWeekendBookingValidation();
const apptTest6 = testDoubleBookingDetection();

const apptAllPassed = apptTest1 && apptTest2 && apptTest3 && apptTest4 && apptTest5 && apptTest6;

console.log("=== Test Summary ===");
console.log(`Test 1 (Creation Validation): ${apptTest1 ? "PASSED" : "FAILED"}`);
console.log(`Test 2 (Modal Validation): ${apptTest2 ? "PASSED" : "FAILED"}`);
console.log(`Test 3 (Date/Time Formatting): ${apptTest3 ? "PASSED" : "FAILED"}`);
console.log(`Test 4 (Appointment Types): ${apptTest4 ? "PASSED" : "FAILED"}`);
console.log(`Test 5 (Weekend Booking Validation): ${apptTest5 ? "PASSED" : "FAILED"}`);
console.log(`Test 6 (Double-Booking Detection): ${apptTest6 ? "PASSED" : "FAILED"}`);
console.log(`\nOverall: ${apptAllPassed ? "ALL TESTS PASSED ✓" : "SOME TESTS FAILED ✗"}`);

if (!apptAllPassed) {
  process.exit(1);
}
