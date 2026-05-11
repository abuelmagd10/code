"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { rateBookingSchema } from "@/lib/services/booking-api"
import { Star, Loader2 } from "lucide-react"

type RateValues = z.infer<typeof rateBookingSchema>

interface BookingRatingProps {
  bookingId:    string
  existingRating?: number | null
  existingFeedback?: string | null
  lang?:        string
  canRate?:     boolean
  onRated?:     () => void
}

export function BookingRating({
  bookingId,
  existingRating,
  existingFeedback,
  lang     = "ar",
  canRate  = true,
  onRated,
}: BookingRatingProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [hovered, setHovered]     = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const alreadyRated = existingRating != null

  const form = useForm<RateValues>({
    resolver: zodResolver(rateBookingSchema),
    defaultValues: {
      rating:   existingRating ?? 0,
      feedback: existingFeedback ?? null,
    },
  })

  const watchedRating = form.watch("rating")

  const handleSubmit = async (data: RateValues) => {
    setIsSubmitting(true)
    try {
      const res  = await fetch(`/api/bookings/${bookingId}/rate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toastActionSuccess(toast, t("تم حفظ التقييم", "Rating saved"))
      onRated?.()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (alreadyRated && !canRate) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={`w-6 h-6 ${i < (existingRating ?? 0) ? "fill-amber-400 text-amber-400" : "text-gray-200 dark:text-gray-700"}`}
            />
          ))}
          <span className="text-sm text-muted-foreground mr-2">({existingRating}/5)</span>
        </div>
        {existingFeedback && (
          <p className="text-sm text-muted-foreground italic">"{existingFeedback}"</p>
        )}
      </div>
    )
  }

  if (!canRate) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("التقييم متاح فقط بعد اكتمال الخدمة", "Rating available after service completion")}
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" dir={isAr ? "rtl" : "ltr"}>

        {/* Star selector */}
        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("التقييم", "Rating")} *</FormLabel>
              <FormControl>
                <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
                  {Array.from({ length: 5 }, (_, i) => {
                    const starVal    = i + 1
                    const isFilled   = starVal <= (hovered ?? field.value ?? 0)
                    return (
                      <button
                        key={i}
                        type="button"
                        onMouseEnter={() => setHovered(starVal)}
                        onClick={() => field.onChange(starVal)}
                        className="focus:outline-none transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 transition-colors ${
                            isFilled ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-600"
                          }`}
                        />
                      </button>
                    )
                  })}
                  {field.value > 0 && (
                    <span className="text-sm text-muted-foreground mr-2">
                      {field.value}/5
                    </span>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Feedback */}
        <FormField
          control={form.control}
          name="feedback"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("تعليق (اختياري)", "Feedback (optional)")}</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={2}
                  placeholder={t("أضف تعليقاً على تجربتك...", "Share your experience...")}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !watchedRating}
          className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Star className="w-4 h-4" />
          )}
          {isSubmitting ? t("جاري الحفظ...", "Saving...") : t("حفظ التقييم", "Save Rating")}
        </Button>
      </form>
    </Form>
  )
}
