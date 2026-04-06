'use client';

import { useEffect, useState } from 'react';

const navLinks = [
  { href: '#origin', label: '缘起' },
  { href: '#philosophy', label: '理念' },
  { href: '#voices', label: '连接故事' },
  { href: '#how-it-works', label: '运作方式' },
  { href: '#node-card', label: '节点卡' },
  { href: '#join', label: '加入' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-[100] px-10 py-5 flex justify-between items-center transition-all duration-400
      ${scrolled ? 'bg-forest-deep/95 backdrop-blur-[20px] py-3 shadow-[0_2px_20px_rgba(0,0,0,0.2)]' : ''}
      max-md:px-5 max-md:py-4`}>
      <a href="#" className="font-serif text-xl font-bold text-white no-underline flex items-center gap-2.5">
        <svg viewBox="0 0 28 28" fill="none" width="28" height="28">
          <circle cx="14" cy="14" r="13" stroke="#a8c9a0" strokeWidth="1.5"/>
          <path d="M14 6 C14 6, 8 12, 8 17 C8 20.3 10.7 23 14 23 C17.3 23 20 20.3 20 17 C20 12 14 6 14 6Z" fill="#8fb573" opacity="0.6"/>
          <path d="M14 10 C14 10, 10 14, 10 17.5 C10 19.7 11.8 21.5 14 21.5 C16.2 21.5 18 19.7 18 17.5 C18 14 14 10 14 10Z" fill="#a8c9a0"/>
        </svg>
        附近森林
      </a>

      {/* Mobile menu button */}
      <button
        className="hidden max-md:block text-white text-2xl bg-transparent border-none cursor-pointer"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle menu"
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      {/* Desktop nav */}
      <ul className="flex gap-7 list-none max-md:hidden">
        {navLinks.map(link => (
          <li key={link.href}>
            <a href={link.href} className="text-white/70 no-underline text-sm transition-colors hover:text-white">
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="hidden max-md:flex flex-col absolute top-full left-0 right-0 bg-forest-deep/95 backdrop-blur-[20px] py-4 px-5">
          {navLinks.map(link => (
            <a key={link.href} href={link.href}
              className="text-white/70 no-underline text-sm py-3 border-b border-white/5 transition-colors hover:text-white"
              onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
