import { createContext } from "react";

import type { ThemeContextValue } from "@/theme/ThemeProvider.tsx";

export const ThemeContext = createContext<ThemeContextValue | null>(null);

