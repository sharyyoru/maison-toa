"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import NewUserForm from "./NewUserForm";

type UserRow = {
  id: string;
  email: string | null;
  role: string | null;
  firstName: string | null;
  lastName: string | null;
  designation: string | null;
  createdAt: string | null;
};

const ITEMS_PER_PAGE = 10;

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        // Check current user's role
        const { data: authData } = await supabaseClient.auth.getUser();
        if (!isMounted) return;

        const user = authData?.user;
        if (!user) {
          router.replace("/login");
          return;
        }

        setCurrentUserId(user.id);
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const role = ((meta["role"] as string) || "").toLowerCase();
        setIsAdmin(role === "admin");

        // Fetch users list via API
        const response = await fetch("/api/users/list");
        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          setUsers(Array.isArray(data) ? data : []);
        }

        setLoading(false);
      } catch {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleMakeAdmin(userId: string) {
    if (!isAdmin || updatingUserId) return;

    try {
      setUpdatingUserId(userId);

      const response = await fetch("/api/users/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: "admin" }),
      });

      if (response.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: "admin" } : u))
        );
      }
    } catch {
      // Ignore errors
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function handleRemoveAdmin(userId: string) {
    if (!isAdmin || updatingUserId) return;

    try {
      setUpdatingUserId(userId);

      const response = await fetch("/api/users/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: "staff" }),
      });

      if (response.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: "staff" } : u))
        );
      }
    } catch {
      // Ignore errors
    } finally {
      setUpdatingUserId(null);
    }
  }

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.toLowerCase();
      const email = (user.email ?? "").toLowerCase();
      const role = (user.role ?? "").toLowerCase();
      const designation = (user.designation ?? "").toLowerCase();
      return (
        fullName.includes(term) ||
        email.includes(term) ||
        role.includes(term) ||
        designation.includes(term)
      );
    });
  }, [users, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "Invite, manage, and configure roles for team members using the CRM."
              : "View team members using the CRM."}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition ${
              showCreateForm
                ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "border-sky-200 bg-sky-600 text-white hover:bg-sky-700"
            }`}
          >
            {showCreateForm ? (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                Hide Form
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add User
              </>
            )}
          </button>
        )}
      </div>

      {isAdmin && showCreateForm && (
        <NewUserForm />
      )}

      <UserTable
        users={paginatedUsers}
        allUsersCount={filteredUsers.length}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        updatingUserId={updatingUserId}
        onMakeAdmin={handleMakeAdmin}
        onRemoveAdmin={handleRemoveAdmin}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        itemsPerPage={ITEMS_PER_PAGE}
      />
    </div>
  );
}

function UserTable({
  users,
  allUsersCount,
  isAdmin,
  currentUserId,
  updatingUserId,
  onMakeAdmin,
  onRemoveAdmin,
  searchQuery,
  onSearchChange,
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage,
}: {
  users: UserRow[];
  allUsersCount: number;
  isAdmin: boolean;
  currentUserId: string | null;
  updatingUserId: string | null;
  onMakeAdmin: (userId: string) => void;
  onRemoveAdmin: (userId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-slate-800">Team</h2>
          <p className="text-xs text-slate-500">
            {allUsersCount} team member{allUsersCount !== 1 ? "s" : ""} in the system.
          </p>
        </div>
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, role..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/80 py-1.5 pl-9 pr-3 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>
      {users.length === 0 ? (
        <p className="text-slate-500 text-xs">No users found{searchQuery ? " matching your search" : ""}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="border-b text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Designation</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                {isAdmin && <th className="py-2 pr-4 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const fullName = [user.firstName, user.lastName]
                  .filter(Boolean)
                  .join(" ");
                const userRole = (user.role || "staff").toLowerCase();
                const isUserAdmin = userRole === "admin";
                const isSelf = user.id === currentUserId;
                const isUpdating = updatingUserId === user.id;

                return (
                  <tr key={user.id} className="hover:bg-slate-50/70">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-slate-900">
                        {fullName || "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {user.email || "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                          isUserAdmin
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-50 text-slate-700"
                        }`}
                      >
                        {user.role || "staff"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {user.designation || "—"}
                    </td>
                    <td className="py-2 pr-4 text-[11px] text-slate-500">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    {isAdmin && (
                      <td className="py-2 pr-4">
                        {!isSelf && (
                          <>
                            {isUserAdmin ? (
                              <button
                                type="button"
                                onClick={() => onRemoveAdmin(user.id)}
                                disabled={isUpdating}
                                className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                              >
                                {isUpdating ? "..." : "Remove Admin"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onMakeAdmin(user.id)}
                                disabled={isUpdating}
                                className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                              >
                                {isUpdating ? "..." : "Make Admin"}
                              </button>
                            )}
                          </>
                        )}
                        {isSelf && (
                          <span className="text-[10px] text-slate-400">You</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-500">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, allUsersCount)} of {allUsersCount} users
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ←
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] ${
                    currentPage === pageNum
                      ? "border-sky-500 bg-sky-500 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
