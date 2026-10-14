# R8 rules for the release build (minify + resource shrinking).
#
# kotlinx.serialization, Ktor, supabase-kt, Credentials and Play Billing ship consumer rules;
# the rules below repeat the parts this app depends on so a library update can't silently
# break JSON parsing in release builds only.

-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod, RuntimeVisibleAnnotations, AnnotationDefault

# --- kotlinx.serialization: the app's DTOs (body<T>() looks serializers up by type) ---
-if @kotlinx.serialization.Serializable class com.aidoraa.app.**
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class com.aidoraa.app.** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.aidoraa.app.**$$serializer { *; }
-keepclassmembers class com.aidoraa.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.aidoraa.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- supabase-kt: sessions and auth responses are kotlinx.serialization classes too ---
-keep,includedescriptorclasses class io.github.jan.supabase.**$$serializer { *; }
-keepclassmembers class io.github.jan.supabase.** {
    *** Companion;
}
-keepclasseswithmembers class io.github.jan.supabase.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Ktor / coroutines: atomic field updaters are reached by field name ---
-keepclassmembers class io.ktor.** {
    volatile <fields>;
}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# --- Credential Manager: the Play services provider is created by reflection ---
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }

# Optional JVM-only references pulled in by Ktor and its dependencies.
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn io.ktor.util.debug.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
