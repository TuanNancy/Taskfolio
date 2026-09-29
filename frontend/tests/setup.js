import "@testing-library/jest-dom/vitest";
// Shared DOM assertions and cleanup for frontend tests only.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
