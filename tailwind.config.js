/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    // tailwind.safelist.html は public/index.html と public/js/main.js から
    // 全クラス名を抽出して生成した軽量スキャン用ファイル。
    // 直接 index.html (456KB) や main.js (1.5MB) をスキャンすると
    // Tailwind v3 の Zone Allocation OOM が発生するため、このファイルのみスキャンする。
    // クラスが追加されたら: node scripts/gen_tailwind_safelist.mjs を再実行すること。
    "./tailwind.safelist.html",
  ],
  theme: {
    extend: {
      transitionTimingFunction: {
        'spring-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring-smooth': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        'fade-in-down': 'fade-in-down 0.4s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        'pop-in': 'pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }
    },
  },
  plugins: [],
}
