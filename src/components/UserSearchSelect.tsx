"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type User = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type UserSearchSelectProps = {
  value: string;
  onChange: (userId: string, user?: User) => void;
  placeholder?: string;
  className?: string;
  includeAssigned?: boolean;
};

export default function UserSearchSelect({
  value,
  onChange,
  placeholder = "Search users...",
  className = "",
  includeAssigned = false,
}: UserSearchSelectProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
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

        console.log("UserSearchSelect loaded users:", data, error);

        if (!error && data) {
          setUsers(data as User[]);
          // Find selected user
          if (value && value !== "assigned") {
            const found = data.find((u: any) => u.id === value);
            if (found) setSelectedUser(found as User);
          }
        }
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [value]);

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

  function handleSelect(user: User | null, specialValue?: string) {
    if (specialValue === "assigned") {
      onChange("assigned");
      setSelectedUser(null);
      setSearch("");
      setIsOpen(false);
      return;
    }

    if (user) {
      onChange(user.id, user);
      setSelectedUser(user);
      setSearch("");
      setIsOpen(false);
    }
  }

  function handleClear() {
    onChange("");
    setSelectedUser(null);
    setSearch("");
  }

  const displayValue = value === "assigned" 
    ? "Assigned User (from trigger)" 
    : selectedUser 
      ? getUserDisplayName(selectedUser) 
      : "";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        {selectedUser || value === "assigned" ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs font-medium text-sky-700 shrink-0">
                {value === "assigned" ? "👤" : getUserDisplayName(selectedUser!).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{displayValue}</p>
                {selectedUser && (
                  <p className="text-xs text-slate-500 truncate">{selectedUser.email}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="ml-2 shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
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
        )}
      </div>

      {isOpen && !selectedUser && value !== "assigned" && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-500">Loading users...</div>
          ) : (
            <>
              {includeAssigned && (
                <button
                  type="button"
                  onClick={() => handleSelect(null, "assigned")}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100">
                    <span className="text-sm">👤</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Assigned User</p>
                    <p className="text-xs text-slate-500">User assigned to the trigger context</p>
                  </div>
                </button>
              )}

              {filteredUsers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">
                  {search ? "No users found" : "No users available"}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelect(user)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                  >
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
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
