const Usuario = require("../models/Usuario");
const Producto = require("../models/Producto");
const Cliente = require("../models/Cliente");
const Pedido = require("../models/Pedido");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "variables.env" });

const crearToken = (usuario, secreta, expiresIn) => {
  const { id, email, nombre, apellido } = usuario;

  return jwt.sign({ id, email, nombre, apellido }, secreta, { expiresIn });
};
//Resolver
const resolvers = {
  Query: {
    obtenerUsuario: async (_, {}, ctx) => {
      return ctx.usuario;
    },
    obtenerProductos: async () => {
      try {
        const productos = await Producto.find({});

        return productos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerProducto: async (_, { id }) => {
      //Validar si existe el prod
      const producto = await Producto.findById(id);

      if (!producto) {
        throw new Error("Producto no encontrado");
      }

      return producto;
    },
    ////Clientes
    obtenerClientes: async () => {
      try {
        const clientes = await Cliente.find({});

        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerClientesByVendedor: async (_, {}, ctx) => {
      try {
        const clientes = await Cliente.find({
          vendedor: ctx.usuario.id.toString(),
        });

        return clientes;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerCliente: async (_, { id }, ctx) => {
      //Validar que exista Cliente
      const cliente = await Cliente.findById(id);

      if (!cliente) {
        throw new Error("Cliente no encontrado");
      }

      // Valida vendedor
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso para ver Cliente");
      }

      return cliente;
    },
    //////// Pedidos
    obtenerPedidos: async () => {
      try {
        const pedidos = await Pedido.find({}).populate("cliente");
        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedidosVendedor: async (_, {}, ctx) => {
      try {
        const pedidos = await Pedido.find({
          vendedor: ctx.usuario.id,
        }).populate("cliente");

        return pedidos;
      } catch (error) {
        console.log(error);
      }
    },
    obtenerPedido: async (_, { id }, ctx) => {
      //Valida que exista el pedido
      const pedido = await (await Pedido.findById(id)).populate("cliente");
      if (!pedido) {
        throw new Error("Pedido no encontrado");
      }
      //Valida vendedor del pedido
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso para el pedido");
      }

      return pedido;
    },
    obtenerPedidosEstado: async (_, { estado }, ctx) => {
      const pedidos = await Pedido.find({
        vendedor: ctx.usuario.id,
        estado,
      }).populate("cliente");

      return pedidos;
    },
    mejoresClientes: async () => {
      const clientes = await Pedido.aggregate([
        { $match: { estado: "COMPLETADO" } },
        {
          $group: {
            _id: "$cliente",
            total: { $sum: "$total" },
          },
        },
        {
          $lookup: {
            from: "clientes",
            localField: "_id",
            foreignField: "_id",
            as: "cliente",
          },
        },
        {
          $limit: 10,
        },
        {
          $sort: { total: -1 },
        },
      ]);

      return clientes;
    },
    mejoresVendedores: async () => {
      const vendedores = await Pedido.aggregate([
        { $match: { estado: "COMPLETADO" } },
        {
          $group: {
            _id: "$vendedor",
            total: { $sum: "$total" },
          },
        },
        {
          $lookup: {
            from: "usuarios",
            localField: "_id",
            foreignField: "_id",
            as: "vendedor",
          },
        },
        {
          $limit: 3,
        },
        {
          $sort: { total: -1 },
        },
      ]);

      return vendedores;
    },
    buscarProducto: async (_, { texto }) => {
      const productos = await Producto.find({
        $text: { $search: texto },
      }).limit(10);

      return productos;
    },
  },
  Mutation: {
    nuevoUsuario: async (_, { input }) => {
      const { email, password } = input;

      const existeUsuario = await Usuario.findOne({ email });
      if (existeUsuario) {
        throw new Error("El usuario ya esta registrado");
      }

      //Password Hash
      const salt = await bcryptjs.genSalt(10);
      input.password = await bcryptjs.hash(password, salt);

      try {
        const usuario = new Usuario(input);
        usuario.save();
        return usuario;
      } catch (error) {
        console.log(error);
      }
    },
    autenticarUsuario: async (_, { input }) => {
      const { email, password } = input;
      //Existe usuario
      const existeUsuario = await Usuario.findOne({ email });
      if (!existeUsuario) {
        throw new Error("El usuario no existe");
      }

      //Validar password
      const passwordCorrecto = await bcryptjs.compare(
        password,
        existeUsuario.password
      );
      if (!passwordCorrecto) {
        throw new Error("Contraseña incorrecta");
      }

      //Enviart Token
      return {
        token: crearToken(existeUsuario, process.env.SECRET_KEY, "24h"),
      };
    },
    nuevoProducto: async (_, { input }) => {
      try {
        const producto = new Producto(input);
        const resultado = await producto.save();
        return resultado;
      } catch (error) {
        console.log(error);
      }
    },
    actualizarProducto: async (_, { id, input }) => {
      //Validar si existe el prod
      let producto = await Producto.findById(id);

      if (!producto) {
        throw new Error("Producto no encontrado");
      }

      producto = await Producto.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });

      return producto;
    },
    eliminarProducto: async (_, { id }) => {
      //Validar si existe el prod
      let producto = await Producto.findById(id);

      if (!producto) {
        throw new Error("Producto no encontrado");
      }

      //Eliminar
      await Producto.findOneAndDelete({ _id: id });

      return "Producto Eliminado";
    },
    ////Clientes
    nuevoCliente: async (_, { input }, ctx) => {
      const { email } = input;
      //Verifica duplicados
      const existeCliente = await Cliente.findOne({ email });

      if (existeCliente) {
        throw new Error("Ese cliente ya esta registrado");
      }

      const nuevoCliente = new Cliente(input);
      //asignar Vendedor
      nuevoCliente.vendedor = ctx.usuario.id;

      try {
        //Crear cliente

        const resultado = await nuevoCliente.save();

        return resultado;
      } catch (error) {
        console.log(error);
      }
    },
    actualizarCliente: async (_, { id, input }, ctx) => {
      //Valida si existe cliente
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("El Cliente no existe");
      }

      //Valida si pertenece al usuario actual
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso para el Cliente");
      }
      //Actualiza datos
      cliente = await Cliente.findOneAndUpdate({ _id: id }, input, {
        new: true,
      });

      return cliente;
    },
    eliminarCliente: async (_, { id }, ctx) => {
      //Valida si existe cliente
      let cliente = await Cliente.findById(id);
      if (!cliente) {
        throw new Error("El Cliente no existe");
      }

      //Valida si pertenece al usuario actual
      if (cliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso para el Cliente");
      }

      //Eliminar Cliente
      await Cliente.findOneAndDelete({ _id: id });

      return "Cliente Eliminado";
    },
    /////Pedidos
    nuevoPedido: async (_, { input }, ctx) => {
      const { cliente } = input;
      //Valida si cliente existe
      const clienteExiste = await Cliente.findById(cliente);
      if (!clienteExiste) {
        throw new Error("El Cliente no existe");
      }

      //Valida si pertenece al usuario actual
      if (clienteExiste.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso para el Cliente");
      }

      //Validar inventario
      for await (const articulo of input.pedido) {
        const { id } = articulo;
        const producto = await Producto.findById(id);

        if (articulo.cantidad > producto.existencia) {
          throw new Error(
            `El articulo: ${producto.nombre} excede la cantidad disponible`
          );
        } else {
          // Restar la cantidad a la existencia
          producto.existencia = producto.existencia - articulo.cantidad;

          await producto.save();
        }
      }

      //Crear Pedido
      const nuevoPedido = new Pedido(input);

      ///Asignar Vendedor
      nuevoPedido.vendedor = ctx.usuario.id;

      ///Guardar Registro
      const resultado = await nuevoPedido.save();

      return resultado;
    },
    actualizarPedido: async (_, { id, input }, ctx) => {
      const { cliente } = input;

      // Validar si existe pedido
      const existePedido = await Pedido.findById(id);
      if (!existePedido) {
        throw new Error("El pedido no existe");
      }
      //Validar si existe cliente'
      const existeCliente = await Cliente.findById(cliente);
      if (!existeCliente) {
        throw new Error("El cliente no existe");
      }

      //Validar cliente - vendedor
      if (existeCliente.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso para este Cliente");
      }

      //Revisar stock
      if (input.pedido) {
        for await (const articulo of input.pedido) {
          const { id } = articulo;
          const producto = await Producto.findById(id);

          if (articulo.cantidad > producto.existencia) {
            throw new Error(
              `El articulo: ${producto.nombre} excede la cantidad disponible`
            );
          } else {
            // Restar la cantidad a la existencia
            producto.existencia = producto.existencia - articulo.cantidad;

            await producto.save();
          }
        }
      }

      //Guardar el pedido
      const resultado = await Pedido.findByIdAndUpdate({ _id: id }, input, {
        new: true,
      });

      return resultado;
    },
    eliminarPedido: async (_, { id }, ctx) => {
      // Validar si existe pedido
      const pedido = await Pedido.findById(id);
      if (!pedido) {
        throw new Error("El pedido no existe");
      }
      //Validar si es el mismo vendedor
      if (pedido.vendedor.toString() !== ctx.usuario.id) {
        throw new Error("No tienes permiso a este pedido");
      }

      await Pedido.findOneAndDelete({ _id: id });

      return "Pedido Eliminado";
    },
  },
};

module.exports = resolvers;
