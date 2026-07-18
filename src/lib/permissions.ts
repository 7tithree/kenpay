// Permission keys — derived 1:1 from Permissions.txt
export const PERMISSIONS = {
  // Payroll & payroll exemptions, taxes & rates + other deductions
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_RUN: "payroll.run",
  PAYROLL_CERTIFY: "payroll.certify",
  PAYROLL_APPROVE: "payroll.approve",
  PAYROLL_CANCEL: "payroll.cancel",
  RATES_EDIT: "payroll.rates.edit", // edit deduction/scheme/tax rates
  EXEMPTIONS_MANAGE: "payroll.exemptions.manage",

  // Payslips
  PAYSLIP_EMAIL: "payslip.email",
  PAYSLIP_DOWNLOAD: "payslip.download",

  // Reports
  REPORTS_VIEW: "reports.view",   // each deduction report
  REPORTS_EXPORT: "reports.export",

  // Employment types
  EMPTYPE_VIEW: "emptype.view",
  EMPTYPE_CREATE: "emptype.create",
  EMPTYPE_EDIT: "emptype.edit",
  EMPTYPE_DELETE: "emptype.delete",

  // Salaries
  SALARY_HISTORY: "salary.history",
  SALARY_VIEW: "salary.view",
  SALARY_EDIT: "salary.edit",
  SALARY_ADD: "salary.add",
  SALARY_DELETE: "salary.delete",

  // Employees
  EMPLOYEE_VIEW: "employee.view",
  EMPLOYEE_ADD: "employee.add",
  EMPLOYEE_EDIT: "employee.edit",
  EMPLOYEE_DELETE: "employee.delete",
  EMPLOYEE_STATUS: "employee.status", // set status/role
  EMPLOYEE_EXPORT: "employee.export",
  EMPLOYEE_IMPORT: "employee.import", // CSV upload

  // Allowances (cash earnings breakdown)
  ALLOWANCE_VIEW: "allowance.view",
  ALLOWANCE_CREATE: "allowance.create",
  ALLOWANCE_EDIT: "allowance.edit", // includes assigning/removing recipients
  ALLOWANCE_DELETE: "allowance.delete",

  // Benefits (non-cash, in-kind)
  BENEFIT_VIEW: "benefit.view",
  BENEFIT_CREATE: "benefit.create",
  BENEFIT_EDIT: "benefit.edit", // includes assigning/removing recipients
  BENEFIT_DELETE: "benefit.delete",

  // General permissions
  ACCESS_SALARY_RATES: "general.salary_rates",
  ACCESS_PENSION_RATES: "general.pension_rates",
  RESET_PAYROLL: "general.reset_payroll",

  // Company settings
  COMPANY_VIEW: "company.view",
  COMPANY_ADD: "company.add",
  COMPANY_EDIT: "company.edit",
  COMPANY_DELETE: "company.delete",
  COMPANY_ASSIGN_ROLES: "company.assign_roles",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

// Convenience role presets used at seed / company creation
export const ROLE_PRESETS: Record<string, PermissionKey[]> = {
  Admin: ALL_PERMISSIONS,
  "Payroll Officer": [
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_RUN,
    PERMISSIONS.PAYROLL_CERTIFY,
    PERMISSIONS.RATES_EDIT,
    PERMISSIONS.EXEMPTIONS_MANAGE,
    PERMISSIONS.PAYSLIP_DOWNLOAD,
    PERMISSIONS.PAYSLIP_EMAIL,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_ADD,
    PERMISSIONS.EMPLOYEE_EDIT,
    PERMISSIONS.EMPLOYEE_IMPORT,
    PERMISSIONS.SALARY_VIEW,
    PERMISSIONS.SALARY_HISTORY,
    PERMISSIONS.EMPTYPE_VIEW,
    PERMISSIONS.ALLOWANCE_VIEW,
    PERMISSIONS.ALLOWANCE_CREATE,
    PERMISSIONS.ALLOWANCE_EDIT,
    PERMISSIONS.BENEFIT_VIEW,
    PERMISSIONS.BENEFIT_CREATE,
    PERMISSIONS.BENEFIT_EDIT,
  ],
  Approver: [
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_APPROVE,
    PERMISSIONS.PAYROLL_CANCEL,
    PERMISSIONS.REPORTS_VIEW,
  ],
  Viewer: [
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.SALARY_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.EMPTYPE_VIEW,
    PERMISSIONS.COMPANY_VIEW,
    PERMISSIONS.ALLOWANCE_VIEW,
    PERMISSIONS.BENEFIT_VIEW,
  ],
};
