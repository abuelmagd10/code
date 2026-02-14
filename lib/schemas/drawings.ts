import { z } from "zod"

export const drawingSchema = z.object({
    shareholderId: z.string().min(1, "Shareholder is required"),
    amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
    drawingDate: z.string().min(1, "Date is required"),
    paymentAccountId: z.string().min(1, "Payment account is required"),
    description: z.string().optional(),
})

export type DrawingFormValues = z.infer<typeof drawingSchema>
