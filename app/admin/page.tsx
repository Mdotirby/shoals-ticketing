"use client";

import { useEffect, useState } from "react";

type DashboardStats = {
  totalEvents: number;
  totalOrders: number;
  totalRevenue: number;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEvents: 0,
    totalOrders: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    // Fetch basic stats from events table
    fetch("/api/events")
      .then((res) => res.json())
      .then((events) => {
        if (Array.isArray(events)) {
          setStats({
            totalEvents: events.length,
            totalOrders: 0, // TODO: fetch from orders table
            totalRevenue: 0, // TODO: calculate from orders
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="admin-dashboard">
      <h1 className="admin-page-title">Dashboard</h1>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <span className="admin-stat-label">Active Events</span>
          <span className="admin-stat-value">{stats.totalEvents}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Total Orders</span>
          <span className="admin-stat-value">{stats.totalOrders}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Total Revenue</span>
          <span className="admin-stat-value">
            ${stats.totalRevenue.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
