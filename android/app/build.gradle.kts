plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from the environment (GitHub secrets in .github/workflows/android.yml). The same key must
// sign every release, otherwise Android refuses to install an update over the previous version.
val keystorePath: String? = System.getenv("BV_KEYSTORE")

android {
    namespace = "io.github.kolyagames.bettervesktop"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.kolyagames.bettervesktop"
        minSdk = 28
        targetSdk = 35
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "0.1.0"
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("BV_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BV_KEY_ALIAS")
                keyPassword = System.getenv("BV_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }


    androidResources {
        // the BetterDiscord renderer is read on every page load; skip decompressing it each time
        noCompress += listOf("js", "css", "json")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// The web side (shim, BetterDiscord, settings page) is built by `pnpm build:android` into assets/bdvk.
tasks.named("preBuild") {
    doFirst {
        if (!file("src/main/assets/bdvk/shim.js").exists()) {
            throw GradleException("assets/bdvk is missing: run `pnpm build:android` in the repository root first")
        }
    }
}
