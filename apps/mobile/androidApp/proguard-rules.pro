# kotlinx.serialization, Ktor, supabase-kt and Play Billing ship their own consumer rules.
# Keep the app's @Serializable DTO serializers (covered by the library rules) and silence
# optional JVM-only references pulled in by Ktor and its dependencies.
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn io.ktor.util.debug.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
