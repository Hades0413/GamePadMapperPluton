package moe.shizuku.api;

import android.os.IBinder;
import android.os.Parcel;
import android.os.Parcelable;

/**
 * Contenedor con el que Shizuku entrega su binder a la app (ContentProvider "sendBinder").
 * Debe tener exactamente este paquete y nombre: Shizuku lo serializa con este nombre de clase.
 * Formato compatible con Shizuku-API (Apache 2.0): un IBinder escrito con writeStrongBinder.
 */
public class BinderContainer implements Parcelable {
    public IBinder binder;

    public BinderContainer(IBinder binder) {
        this.binder = binder;
    }

    protected BinderContainer(Parcel in) {
        this.binder = in.readStrongBinder();
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeStrongBinder(binder);
    }

    public static final Creator<BinderContainer> CREATOR = new Creator<BinderContainer>() {
        @Override
        public BinderContainer createFromParcel(Parcel source) {
            return new BinderContainer(source);
        }

        @Override
        public BinderContainer[] newArray(int size) {
            return new BinderContainer[size];
        }
    };
}
