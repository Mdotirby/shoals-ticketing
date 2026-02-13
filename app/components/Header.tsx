"use client"

import Image from "next/image";

export default function Header() {
  return (
    <header className="site-header">
      <Image 
        src="/beige-brown-logo.png" 
        alt="West72 Logo"
        width={180}
        height={60}
        priority
      />
    </header>
  );
}


