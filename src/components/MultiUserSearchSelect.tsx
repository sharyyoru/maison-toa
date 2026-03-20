"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type User = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type AssignmentMode = "all" | "round_robin";

type MultiUserSearchSelectProps = {
  value: string[]; // Array of user IDs
  onChange: (userIds: string[]) => void;
  assignmentMode: AssignmentMode;
  onAssignmentModeChange: (mode: AssignmentMode) => void;
  placeholder?: string;
  className?: string;
  includeAssigned?: boolean;
};

export default function MultiUserSearchSelect({
  value,
  onChange,
  assignmentMode,
  onAssignmentModeChange,
  placeholder = "Search users...",
  className = "",
  includeAssigned = false,
}: MultiUserSearchSelectProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [hasAssigned, setHasAssigned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all users on mount
  useEffect(() => {
    async function loadUsers() {
      try {
        const { data, error } = await supabaseClient
          .from("users")
          .select("id, email, full_name")
          .order("email");

        if (!error && data) {
          setUsers(data as User[]);
        }
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  // Sync selected users with value prop
  useEffect(() => {
    if (value.includes("assigned")) {
      setHasAssigned(true);
    } else {
      setHasAssigned(false);
    }

    const userIds = value.filter((id) => id !== "assigned");
    const found = users.filter((u) => userIds.includes(u.id));
    setSelectedUsers(found);
  }, [value, users]);

  // Filter users based on search
  useEffect(() => {
    if (!search.trim()) {
      setFilteredUsers(users);
      return;
    }

    const searchLower = search.toLowerCase();
    const filtered = users.filter((user) => {
      const name = getUserDisplayName(user).toLowerCase();
      const email = (user.email || "").toLowerCase();
      return name.includes(searchLower) || email.includes(searchLower);
    });
    setFilteredUsers(filtered);
  }, [search, users]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function getUserDisplayName(user: User): string {
    if (user.full_name) {
      return user.full_name;
    }
    return user.email?.split("@")[0] || "Unknown";
  }

  function handleToggleUser(user: User) {
    const currentIds = [...value];
    const index = currentIds.indexOf(user.id);
    
    if (index > -1) {
      currentIds.splice(index, 1);
    } else {
      currentIds.push(user.id);
    }
    
    onChange(currentIds);
  }

  function handleToggleAssigned() {
    const currentIds = [...value];
    const index = currentIds.indexOf("assigned");
    
    if (index > -1) {
      currentIds.splice(index, 1);
    } else {
      currentIds.push("assigned");
    }
    
    onChange(currentIds);
  }

  function handleRemoveUser(userId: string) {
    onChange(value.filter((id) => id !== userId));
  }

  function handleClearAll() {
    onChange([]);
  }

  const isSelected = (userId: string) => value.includes(userId);
  const totalSelected = value.length;

  return (
    <div ref={containerRef} className={`space-y-3 ${className}`}>
      {/* Selected Users Display */}
      {totalSelected > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hasAssigned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              👤 Assigned User
              <button
                type="button"
                onClick={() => handleRemoveUser("assigned")}
                className="ml-0.5 rounded-full p-0.5 hover:bg-purple-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
            >
              {getUserDisplayName(user)}
              <button
                type="button"
                onClick={() => handleRemoveUser(user.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-sky-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {totalSelected > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-500">Loading users...</div>
          ) : (
            <>
              {includeAssigned && (
                <button
                  type="button"
                  onClick={handleToggleAssigned}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 ${
                    hasAssigned ? "bg-purple-50" : ""
                  }`}
                >
                  <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                    hasAssigned ? "bg-purple-600 border-purple-600" : "border-slate-300"
                  }`}>
                    {hasAssigned && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100">
                    <span className="text-sm">👤</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Assigned User</p>
                    <p className="text-xs text-slate-500">User from trigger context</p>
                  </div>
                </button>
              )}

              {filteredUsers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">
                  {search ? "No users found" : "No users available"}
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const selected = isSelected(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleToggleUser(user)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
                        selected ? "bg-sky-50" : ""
                      }`}
                    >
                      <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                        selected ? "bg-sky-600 border-sky-600" : "border-slate-300"
                      }`}>
                        {selected && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700">
                        {getUserDisplayName(user).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {getUserDisplayName(user)}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}
        </div>
      )}

      {/* Assignment Mode - Only show when multiple users selected */}
      {totalSelected > 1 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Assignment Mode
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="assignment_mode"
                checked={assignmentMode === "all"}
                onChange={() => onAssignmentModeChange("all")}
                className="mt-0.5 h-4 w-4 text-sky-600 border-slate-300"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">All users get the task</span>
                <p className="text-xs text-slate-500">Create a separate task for each selected user</p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="assignment_mode"
                checked={assignmentMode === "round_robin"}
                onChange={() => onAssignmentModeChange("round_robin")}
                className="mt-0.5 h-4 w-4 text-sky-600 border-slate-300"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">Round Robin</span>
                <p className="text-xs text-slate-500">Randomly assign to one user from the list</p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
