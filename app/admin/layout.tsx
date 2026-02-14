// TODO: Design admin layout
// Contains: admin sidebar/header nav, role-based menu items
// Wraps all /admin/* pages except /admin/login
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-layout">
      <nav className="admin-sidebar">Admin Sidebar — awaiting design</nav>
      <main className="admin-main">{children}</main>
    </div>
  );
}
