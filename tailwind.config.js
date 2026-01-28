/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                terminal: {
                    bg: '#000000',
                    green: '#00ff00',
                    dim: '#0c0c0c',
                }
            },
            fontFamily: {
                mono: ['"Fira Code"', 'monospace'],
            }
        },
    },
    plugins: [],
}
