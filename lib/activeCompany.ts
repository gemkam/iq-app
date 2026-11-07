// Which company is selected in the app (one person can have several companies)
const KEY = "iq_company";

export function getActiveCompanyId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveCompanyId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked */
  }
}
