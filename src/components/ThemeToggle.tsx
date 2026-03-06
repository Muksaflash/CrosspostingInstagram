"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />; // Placeholder to avoid layout shift
  }

  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown = () => setIsOpen(false);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={toggleDropdown}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none transition-colors"
        aria-label="Toggle theme"
      >
        <AnimatePresence mode="wait" initial={false}>
          {theme === "light" && (
            <motion.div
              key="light"
              initial={{ opacity: 0, rotate: -90, scale: 0 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Sun size={18} />
            </motion.div>
          )}
          {theme === "dark" && (
            <motion.div
              key="dark"
              initial={{ opacity: 0, rotate: -90, scale: 0 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Moon size={18} />
            </motion.div>
          )}
          {theme === "system" && (
            <motion.div
              key="system"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Monitor size={18} />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-36 rounded-xl bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-white dark:ring-opacity-10 overflow-hidden focus:outline-none"
          >
            <div className="p-1" role="menu" aria-orientation="vertical">
              <button
                onClick={() => { setTheme("light"); closeDropdown(); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  theme === "light"
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <Sun size={16} />
                Светлая
              </button>
              <button
                onClick={() => { setTheme("dark"); closeDropdown(); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  theme === "dark"
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <Moon size={16} />
                Темная
              </button>
              <button
                onClick={() => { setTheme("system"); closeDropdown(); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  theme === "system"
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <Monitor size={16} />
                Системная
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop for closing dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeDropdown}
          aria-hidden="true"
        ></div>
      )}
    </div>
  );
}
