export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    env: {
      hasMasterSheet: !!process.env.MASTER_SHEET_ID,
      hasServiceAccount: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      hasMonday: !!process.env.SHEET_MONDAY,
      masterSheetId: process.env.MASTER_SHEET_ID ? process.env.MASTER_SHEET_ID.substring(0, 10) + '...' : 'NOT SET',
    },
  })
}
